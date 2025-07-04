#!/usr/bin/env python3
"""
Comprehensive setup verification script for the image-tools backend.
"""

import sys
import os

def test_imports():
    """Test all critical imports."""
    print("=" * 50)
    print("TESTING IMPORTS")
    print("=" * 50)
    
    try:
        # Test config
        from config.settings import settings
        print("✓ Config.settings imported successfully")
        
        # Test models
        from core.models.responses import ProcessingResponse
        from core.models.job import Job, JobStatus
        print("✓ Core models imported successfully")
        
        # Test messaging
        from core.messaging.queue_manager import QueueManager
        print("✓ Queue manager imported successfully")
        
        # Test storage
        from core.storage.storage_manager import StorageManager
        print("✓ Storage manager imported successfully")
        
        # Test background removal service
        from services.background_removal.processor import BackgroundRemovalProcessor
        from services.background_removal.router import router as bg_router
        print("✓ Background removal service imported successfully")
        
        # Test FastAPI app
        from main import app
        print("✓ FastAPI app imported successfully")
        print(f"  App type: {type(app).__name__}")
        print(f"  Number of routes: {len(app.routes)}")
        
        return True
        
    except Exception as e:
        print(f"✗ Import error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_app_structure():
    """Test the FastAPI app structure."""
    print("\n" + "=" * 50)
    print("TESTING APP STRUCTURE")
    print("=" * 50)
    
    try:
        from main import app
        
        # List all routes
        print("Available routes:")
        for route in app.routes:
            if hasattr(route, 'path'):
                methods = getattr(route, 'methods', ['N/A'])
                if hasattr(methods, '__iter__') and not isinstance(methods, str):
                    methods_str = ', '.join(sorted(methods))
                else:
                    methods_str = str(methods)
                print(f"  - {route.path} [{methods_str}]")
        
        return True
        
    except Exception as e:
        print(f"✗ App structure test error: {e}")
        return False

def test_dependencies():
    """Test key dependencies."""
    print("\n" + "=" * 50)
    print("TESTING KEY DEPENDENCIES")
    print("=" * 50)
    
    dependencies = [
        'fastapi',
        'uvicorn',
        'pydantic',
        'rembg',
        'numpy',
        'PIL',
        'cv2'
    ]
    
    success = True
    for dep in dependencies:
        try:
            if dep == 'PIL':
                import PIL
                print(f"✓ {dep} (Pillow) version: {PIL.__version__}")
            elif dep == 'cv2':
                import cv2
                print(f"✓ {dep} (OpenCV) version: {cv2.__version__}")
            else:
                module = __import__(dep)
                version = getattr(module, '__version__', 'unknown')
                print(f"✓ {dep} version: {version}")
        except ImportError as e:
            print(f"✗ {dep} not found: {e}")
            success = False
    
    return success

def main():
    """Run all verification tests."""
    print(f"Python version: {sys.version}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Python path: {sys.path[:3]}...")  # Show first 3 entries
    
    # Run tests
    imports_ok = test_imports()
    structure_ok = test_app_structure()
    deps_ok = test_dependencies()
    
    print("\n" + "=" * 50)
    print("VERIFICATION SUMMARY")
    print("=" * 50)
    print(f"Imports: {'✓ PASS' if imports_ok else '✗ FAIL'}")
    print(f"App Structure: {'✓ PASS' if structure_ok else '✗ FAIL'}")
    print(f"Dependencies: {'✓ PASS' if deps_ok else '✗ FAIL'}")
    
    overall_success = imports_ok and structure_ok and deps_ok
    print(f"\nOverall: {'✓ ALL TESTS PASSED' if overall_success else '✗ SOME TESTS FAILED'}")
    
    return 0 if overall_success else 1

if __name__ == "__main__":
    sys.exit(main())
