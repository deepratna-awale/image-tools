import numpy as np
import pytest
from ...background_remover.background_remover import remove_background


def test_remove_background_removes_white_background():
    # Create a 3x3 white image with a black square in the center
    image = np.ones((3, 3, 3), dtype=np.uint8) * 255
    image[1, 1] = [0, 0, 0]
    result = remove_background(image)
    # The center pixel should remain, others should be transparent (alpha=0)
    assert result.shape[2] == 4  # RGBA
    assert (result[1, 1, :3] == [0, 0, 0]).all()
    assert result[1, 1, 3] == 255  # Center pixel opaque
    # Corners should be transparent
    assert result[0, 0, 3] == 0
    assert result[2, 2, 3] == 0


def test_remove_background_handles_no_background():
    # Image with no white pixels
    image = np.zeros((2, 2, 3), dtype=np.uint8)
    result = remove_background(image)
    assert (result[..., 3] == 255).all()  # All pixels opaque


def test_remove_background_partial_transparency():
    # Image with some white and some colored pixels
    image = np.array(
        [[[255, 255, 255], [10, 20, 30]], [[255, 255, 255], [40, 50, 60]]],
        dtype=np.uint8,
    )
    result = remove_background(image)
    assert result[0, 0, 3] == 0  # Transparent
    assert result[1, 0, 3] == 0  # Transparent
    assert result[0, 1, 3] == 255  # Opaque
    assert result[1, 1, 3] == 255  # Opaque


def test_remove_background_invalid_input():
    # Pass a grayscale image
    image = np.ones((3, 3), dtype=np.uint8) * 255
    with pytest.raises(Exception):
        remove_background(image)
