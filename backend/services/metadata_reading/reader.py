"""Read Stable Diffusion generation parameters embedded in an image.

Parsing is done by sd-parsers, which understands the metadata written by
AUTOMATIC1111 (incl. stealth PNG info), ComfyUI, Fooocus, InvokeAI and NovelAI.
It only reads metadata and runs in milliseconds, so no job queue is involved.
"""
import gzip
import io
import json
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image, PngImagePlugin
from sd_parsers import ParserManager
from sd_parsers.data import Model

# sd-parsers' own stealth reader (Eagerness.EAGER) caches results by id(image), which
# can hand one upload's prompt to another, and builds a Python list of every pixel.
# Stealth info is read below with numpy instead and fed back through the PNG parser.
_parser_manager = ParserManager()

STEALTH_HEADERS = {b"stealth_pngcomp": True, b"stealth_pnginfo": False}  # header -> gzipped
_HEADER_BYTES = len(b"stealth_pngcomp")


def read_stealth_parameters(image: Image.Image) -> Optional[str]:
    """Read A1111 "stealth pnginfo": parameters hidden in the alpha channel's lowest bits.

    Bits run down each column, then across columns: a header, a 32-bit bit count, the data.
    """
    if image.mode != "RGBA":
        return None
    bits = (np.asarray(image.getchannel("A")).T & 1).ravel()
    header_bits = (_HEADER_BYTES + 4) * 8
    if bits.size < header_bits:
        return None

    header = np.packbits(bits[: _HEADER_BYTES * 8]).tobytes()
    if header not in STEALTH_HEADERS:
        return None
    length = int.from_bytes(np.packbits(bits[_HEADER_BYTES * 8 : header_bits]).tobytes(), "big")
    if length <= 0 or header_bits + length > bits.size:
        return None

    data = np.packbits(bits[header_bits : header_bits + length]).tobytes()
    try:
        if STEALTH_HEADERS[header]:
            data = gzip.decompress(data)
        return data.decode("utf-8")
    except (OSError, EOFError, UnicodeDecodeError):
        return None


def _parse_stealth(image: Image.Image):
    """Parse stealth parameters as if they were a normal A1111 PNG text chunk"""
    parameters = read_stealth_parameters(image)
    if not parameters:
        return None
    text = PngImagePlugin.PngInfo()
    text.add_text("parameters", parameters)
    buffer = io.BytesIO()
    Image.new("RGB", (1, 1)).save(buffer, format="PNG", pnginfo=text)
    buffer.seek(0)
    return _parser_manager.parse(buffer)


def _text(prompt: Any) -> str:
    """Fooocus stores its expanded prompts as a list"""
    if isinstance(prompt, (list, tuple)):
        return "\n\n".join(str(part) for part in prompt if part)
    return str(prompt or "")


def _jsonable(value: Any) -> Any:
    """Drop anything json can't encode (bytes, enums) to a string"""
    return json.loads(json.dumps(value, default=str))


def _model(model: Optional[Model]) -> Optional[Dict[str, Optional[str]]]:
    if model is None:
        return None
    return {"name": model.name, "hash": model.hash}


def read_metadata(content: bytes) -> Dict[str, Any]:
    """Return the image's basic info and any generation parameters found in it.

    Raises PIL.UnidentifiedImageError when the bytes are not an image.
    """
    with Image.open(io.BytesIO(content)) as image:
        info = {"format": image.format, "width": image.width, "height": image.height}
        prompt_info = _parser_manager.parse(image)
        if prompt_info is None and image.format == "PNG":
            prompt_info = _parse_stealth(image)

    if prompt_info is None:
        return {"found": False, "image": info}

    models: List[Dict[str, Optional[str]]] = []
    for sampler in prompt_info.samplers:
        model = _model(sampler.model)
        if model and model not in models:
            models.append(model)

    return {
        "found": True,
        "image": info,
        "generator": prompt_info.generator.value,
        "prompt": _text(prompt_info.full_prompt),
        "negative_prompt": _text(prompt_info.full_negative_prompt),
        "models": models,
        "samplers": [
            {
                "name": sampler.name,
                "parameters": _jsonable(sampler.parameters),
                "model": _model(sampler.model),
            }
            for sampler in prompt_info.samplers
        ],
        "metadata": _jsonable(
            {k: v for k, v in prompt_info.metadata.items() if k not in ("full_prompt", "full_negative_prompt")}
        ),
        "raw": _jsonable(prompt_info.raw_parameters),
    }
