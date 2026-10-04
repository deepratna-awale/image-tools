import pytest
import sys
import os
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Set test environment variables
os.environ.setdefault("QUEUE_TYPE", "rabbitmq")
os.environ.setdefault("STORAGE_TYPE", "local")
import tempfile

os.environ.setdefault("LOCAL_STORAGE_PATH", tempfile.mkdtemp(prefix="image_tools_test_"))
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("LOG_LEVEL", "DEBUG")


@pytest.fixture(scope="session")
def test_storage_dir():
    """Create a temporary storage directory for tests"""
    import tempfile
    import shutil
    
    temp_dir = tempfile.mkdtemp(prefix="test_storage_")
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def sample_image_bytes():
    """Provide sample image bytes for testing"""
    # Create a simple 1x1 PNG image
    import io
    from PIL import Image
    
    img = Image.new('RGB', (1, 1), color='red')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    return img_bytes.getvalue()
