"""Finds text watermarks (logos aren't detected; the page lets people paint those).

Runs PP-OCRv4's text detection model (Apache-2.0, from the RapidOCR wheel; see the
Dockerfile) with ONNX Runtime on the CPU: a fraction of a second per image, so the
API and the worker run it directly.
"""

import io
import logging
import threading
from typing import List, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps

from config.settings import settings

logger = logging.getLogger(__name__)

# The model wants sides that are multiples of 32; larger images are shrunk to this
MAX_SIDE = 1280
# Pixels above this text probability are text; a box needs this average to count.
# Lower than PP-OCR's defaults (0.3 / 0.5): watermarks are often faint.
PIXEL_THRESHOLD = 0.25
BOX_THRESHOLD = 0.45
# How far a box is grown around the detected text core (PP-OCR's "unclip"), plus a
# little more to take in outlines and drop shadows
UNCLIP_RATIO = 1.6
EXTRA_PADDING = 0.15

Polygon = List[List[float]]

_lock = threading.Lock()
_session = None


def _get_session():
    global _session
    with _lock:
        if _session is None:
            import onnxruntime

            options = onnxruntime.SessionOptions()
            options.log_severity_level = 3
            _session = onnxruntime.InferenceSession(
                settings.text_detection_model_path, options, providers=["CPUExecutionProvider"]
            )
        return _session


def open_image(image_data: bytes) -> Image.Image:
    """The upload the way the worker sees it, turned upright by its EXIF orientation"""
    return ImageOps.exif_transpose(Image.open(io.BytesIO(image_data)))


def detect_text(image: Image.Image) -> List[Polygon]:
    """Corner points (clockwise from top left, in image pixels) of each piece of text, padded"""
    rgb = np.asarray(image.convert("RGB"))
    height, width = rgb.shape[:2]
    factor = min(1.0, MAX_SIDE / max(width, height))
    size_w = max(32, int(round(width * factor / 32)) * 32)
    size_h = max(32, int(round(height * factor / 32)) * 32)
    probability = _text_probability(rgb, size_w, size_h)
    # Small images are also checked at up to twice the size, where small or faint text
    # stands out more; averaging the two keeps what both agree on
    if max(width, height) < MAX_SIDE:
        larger = min(2.0, MAX_SIDE / max(width, height))
        larger_w = int(round(width * larger / 32)) * 32
        larger_h = int(round(height * larger / 32)) * 32
        enlarged = _text_probability(rgb, larger_w, larger_h)
        probability = (probability + cv2.resize(enlarged, (size_w, size_h), interpolation=cv2.INTER_AREA)) / 2

    binary = (probability > PIXEL_THRESHOLD).astype(np.uint8)
    binary = cv2.dilate(binary, np.ones((2, 2), np.uint8))
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    scale_x, scale_y = width / size_w, height / size_h
    boxes: List[Polygon] = []
    for contour in contours[:1000]:
        (cx, cy), (w, h), angle = cv2.minAreaRect(contour)
        if min(w, h) < 3:
            continue
        x, y, box_w, box_h = cv2.boundingRect(contour)
        region = np.zeros((box_h, box_w), np.uint8)
        cv2.fillPoly(region, [contour - [x, y]], 1)
        if cv2.mean(probability[y:y + box_h, x:x + box_w], region)[0] < BOX_THRESHOLD:
            continue
        # Grow the core as PP-OCR does, then pad by part of the text height
        distance = w * h * UNCLIP_RATIO / (2 * (w + h))
        pad = EXTRA_PADDING * min(w, h)
        w, h = w + 2 * (distance + pad), h + 2 * (distance + pad)
        corners = cv2.boxPoints(((cx, cy), (w, h), angle))
        corners[:, 0] = np.clip(corners[:, 0] * scale_x, 0, width)
        corners[:, 1] = np.clip(corners[:, 1] * scale_y, 0, height)
        boxes.append(_clockwise(corners))
    logger.info(f"Found {len(boxes)} text regions in a {width}x{height} image")
    return boxes


def _clockwise(corners: np.ndarray) -> Polygon:
    centre = corners.mean(axis=0)
    order = np.argsort(np.arctan2(corners[:, 1] - centre[1], corners[:, 0] - centre[0]))
    corners = corners[order]
    # Start from the corner nearest the top left
    start = int(np.argmin(corners.sum(axis=1)))
    return [[round(float(x), 1), round(float(y), 1)] for x, y in np.roll(corners, -start, axis=0)]


def _text_probability(rgb: np.ndarray, width: int, height: int) -> np.ndarray:
    """The model's text probability map for the image scaled to width x height (multiples of 32)"""
    scaled = cv2.resize(rgb[:, :, ::-1], (width, height), interpolation=cv2.INTER_AREA)
    batch = ((scaled.astype(np.float32) / 255.0 - 0.5) / 0.5).transpose(2, 0, 1)[None]
    session = _get_session()
    return session.run(None, {session.get_inputs()[0].name: batch})[0][0, 0]


def mask_from_boxes(size: Tuple[int, int], boxes: List[Polygon]) -> bytes:
    """A black PNG of the given size with the boxes filled white"""
    width, height = size
    mask = np.zeros((height, width), np.uint8)
    for box in boxes:
        cv2.fillPoly(mask, [np.round(np.array(box)).astype(np.int32)], 255)
    buffer = io.BytesIO()
    Image.fromarray(mask).save(buffer, format="PNG")
    return buffer.getvalue()
