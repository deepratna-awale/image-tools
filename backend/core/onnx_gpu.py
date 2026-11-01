"""ONNX Runtime settings that keep its GPU memory small, so the cutout and sky models
leave room on the GPU endpoint for the PyTorch models (FLUX.1 Kontext needs most of it).

By default ONNX Runtime's CUDA arena grows in powers of two, never gives memory back and
lets cuDNN try every convolution algorithm with large scratch buffers: after a few
cutouts it held about 15 GB of a 24 GB card."""

import onnxruntime as ort

CUDA_OPTIONS = {
    # Grow the arena only by what is asked for, not to the next power of two
    "arena_extend_strategy": "kSameAsRequested",
    # Pick convolution algorithms by heuristics instead of benchmarking them all,
    # which needs big temporary buffers
    "cudnn_conv_algo_search": "HEURISTIC",
}


def providers() -> list:
    """CUDA (with the options above) when this onnxruntime has it, then the CPU"""
    if "CUDAExecutionProvider" in ort.get_available_providers():
        return [("CUDAExecutionProvider", CUDA_OPTIONS), "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


class ShrinkingSession:
    """An InferenceSession whose runs hand the GPU memory they used back to the device"""

    def __init__(self, session: ort.InferenceSession):
        self._session = session
        self._options = None
        if "CUDAExecutionProvider" in session.get_providers():
            self._options = ort.RunOptions()
            self._options.add_run_config_entry("memory.enable_memory_arena_shrinkage", "gpu:0")

    def run(self, output_names, input_feed, run_options=None):
        return self._session.run(output_names, input_feed, run_options or self._options)

    def __getattr__(self, name):
        return getattr(self._session, name)
