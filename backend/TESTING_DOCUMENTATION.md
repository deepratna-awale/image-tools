# Backend Testing Documentation

## Overview
This document describes the comprehensive test suite for the image processing backend. The tests are organized into unit tests, integration tests, and performance tests, focusing on queue-based processing functionality.

## Test Structure

### Unit Tests (`tests/services/`)
- **Processor Tests** (`test_processor.py`): Test background removal image processing logic
- **Service Tests** (`test_service.py`): Test service layer business logic  
- **Router Tests** (`test_router.py`): Test FastAPI endpoint behavior
- **Model Tests** (`tests/core/test_models.py`): Test data models and validation

### Integration Tests (`tests/test_integration.py`)
- End-to-end workflow testing
- API integration testing
- Queue system testing
- File upload/download testing

### Performance Tests (`tests/test_performance.py`)
- Load testing for concurrent requests
- Response time validation
- Memory usage monitoring
- Queue handling under load

## Test Coverage

### Queue-Based Processing (✅ Implemented)
- Single image processing through queue
- Batch image processing through queue (up to 10 images)
- Job status polling and updates
- Result download functionality
- Error handling and recovery
- Batch ZIP creation and download
- Real-time progress tracking

### Processing Architecture (✅ Verified)
- All processing uses queue-based system
- Queue-based processing endpoints
- Consistent workflow for single and batch operations
- Scalable worker-based processing

## Test Features

### Mocking Strategy
- Storage manager mocking for file operations
- Queue manager mocking for job queuing
- Processor mocking for image processing
- Database/persistence layer mocking

### Test Data Generation
- Synthetic image creation for testing
- Multiple file formats and sizes
- Edge cases (invalid files, large batches)
- Realistic test scenarios

### Performance Validation
- Response time limits (< 5 seconds for single jobs)
- Concurrent request handling (10+ simultaneous)
- Memory usage monitoring
- Load testing with sustained traffic

## Running Tests

### Quick Test Run
```bash
cd backend
python -m pytest tests/ -v
```

### Organized Test Execution
```bash
# Run unit tests only
python run_tests.py --type unit

# Run integration tests
python run_tests.py --type integration  

# Run performance tests
python run_tests.py --type performance

# Run all tests with coverage
python run_tests.py --type all --coverage

# Skip slow tests
python run_tests.py --fast
```

### Test Categories
- **Unit Tests**: Fast, isolated component testing
- **Integration Tests**: End-to-end workflow validation  
- **Performance Tests**: Load and stress testing (marked as `@pytest.mark.slow`)

## Test Configuration
- `pytest.ini`: Test runner configuration
- `run_tests.py`: Custom test runner with categories
- Async test support for FastAPI endpoints
- Coverage reporting and quality checks

## Key Test Scenarios

### Single Image Processing
1. Upload image → Queue job → Poll status → Download result
2. Invalid file type handling
3. Job not found scenarios
4. Processing failures and error handling

### Batch Processing  
1. Upload multiple images → Queue batch → Poll progress → Download ZIP
2. Partial batch failures
3. Too many files (> 10 limit)
4. Mixed valid/invalid files

### API Endpoint Testing
1. All queue-based endpoints functional
2. Proper error codes and messages
3. Input validation and sanitization
4. Batch processing workflow
5. ZIP file generation and download

### Performance Requirements
- Single job submission: < 5 seconds response
- Batch job submission: < 10 seconds response  
- Status checks: < 1 second response
- Concurrent jobs: 95%+ success rate
- Memory usage: Reasonable growth under load

## Current Status

### ✅ Completed
- Test framework and structure setup
- Core unit test coverage for main components
- Integration test scenarios defined
- Performance test benchmarks established
- Queue-based processing verification
- Test runner and configuration

### 🔧 Needs Fixing
- Model creation tests (missing required fields)
- Router validation error handling
- Service method call corrections
- Test data setup for complex scenarios

### 📈 Future Improvements
- Increase test coverage to 90%+
- Add more edge case scenarios
- Database integration testing
- CI/CD pipeline integration
- Automated performance regression testing

## Quality Metrics

### Success Criteria
- All queue-based functionality works correctly
- Batch processing handles up to 10 images efficiently
- Performance meets response time requirements
- Error handling provides meaningful feedback
- Test coverage above 80% for critical paths

### Code Quality
- Flake8 linting compliance (needs cleanup)
- Type hint coverage
- Docstring documentation
- Error handling patterns
- Async/await best practices

## Maintenance

### Regular Testing
- Run full test suite before deployments
- Performance regression testing
- Update tests when adding new features
- Monitor test execution times

### Test Data Management
- Synthetic test images (no real user data)
- Configurable test parameters
- Cleanup of temporary test files
- Isolated test environments
