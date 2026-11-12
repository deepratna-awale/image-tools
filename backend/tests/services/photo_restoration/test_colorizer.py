import numpy as np
import torch

from config.settings import settings
from services.photo_restoration import models


def test_colorizer_loads_hugging_face_bin_weights(tmp_path, monkeypatch):
    """The DDColor repo ships pytorch_model.bin, which spandrel won't open by file name"""
    from spandrel_extra_arches.architectures.DDColor.__arch.ddcolor import DDColor

    model = DDColor(encoder_name="convnext-t", num_queries=100, input_size=(512, 512), num_output_channels=2, last_norm="Spectral")
    torch.save(model.state_dict(), tmp_path / "pytorch_model.bin")
    monkeypatch.setattr(settings, "colorize_model_path", str(tmp_path))

    colorizer = models.Colorizer()
    out = colorizer.colorize(np.full((64, 48, 3), 128, dtype=np.uint8))

    assert out.shape == (64, 48, 3)
    assert out.dtype == np.uint8
