#!/usr/bin/env python3
"""
Test runner script for the background removal backend.
This script runs different categories of tests and provides useful output.
"""

import subprocess
import sys
import argparse
import time
from pathlib import Path


def run_command(cmd, description):
    """Run a command and return the result"""
    print(f"\n{'='*60}")
    print(f"Running: {description}")
    print(f"Command: {' '.join(cmd)}")
    print(f"{'='*60}")
    
    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    end_time = time.time()
    
    print(f"\nDuration: {end_time - start_time:.2f} seconds")
    print(f"Exit code: {result.returncode}")
    
    if result.stdout:
        print(f"\nSTDOUT:\n{result.stdout}")
    if result.stderr:
        print(f"\nSTDERR:\n{result.stderr}")
    
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description="Run backend tests")
    parser.add_argument(
        "--type", 
        choices=["unit", "integration", "performance", "all"],
        default="all",
        help="Type of tests to run"
    )
    parser.add_argument(
        "--coverage", 
        action="store_true",
        help="Generate coverage report"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Skip slow tests"
    )
    
    args = parser.parse_args()
    
    # Change to backend directory
    backend_dir = Path(__file__).parent
    import os
    os.chdir(backend_dir)
    
    success = True
    
    # Base pytest command
    pytest_cmd = ["python", "-m", "pytest"]
    
    if args.verbose:
        pytest_cmd.append("-v")
    
    if args.fast:
        pytest_cmd.extend(["-m", "not slow"])
    
    if args.coverage:
        pytest_cmd.extend([
            "--cov=services",
            "--cov=core", 
            "--cov-report=term-missing",
            "--cov-report=html:htmlcov"
        ])
    
    # Run different test types
    if args.type == "unit" or args.type == "all":
        cmd = pytest_cmd + ["tests/services/", "-m", "not integration and not performance"]
        success &= run_command(cmd, "Unit Tests")
    
    if args.type == "integration" or args.type == "all":
        cmd = pytest_cmd + ["tests/test_integration.py"]
        success &= run_command(cmd, "Integration Tests")
    
    if args.type == "performance" or args.type == "all":
        cmd = pytest_cmd + ["tests/test_performance.py"]
        success &= run_command(cmd, "Performance Tests")
    
    # Run linting
    print(f"\n{'='*60}")
    print("Running Code Quality Checks")
    print(f"{'='*60}")
    
    # Check if flake8 is available
    try:
        flake8_result = subprocess.run(
            ["python", "-m", "flake8", "services/", "core/", "--max-line-length=100"],
            capture_output=True,
            text=True
        )
        if flake8_result.returncode == 0:
            print("✓ Flake8 linting passed")
        else:
            print(f"✗ Flake8 linting failed:\n{flake8_result.stdout}")
            success = False
    except FileNotFoundError:
        print("⚠ Flake8 not installed, skipping linting")
    
    # Summary
    print(f"\n{'='*60}")
    print("TEST SUMMARY")
    print(f"{'='*60}")
    
    if success:
        print("✅ All tests passed!")
        if args.coverage:
            print("📊 Coverage report generated in htmlcov/")
    else:
        print("❌ Some tests failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
