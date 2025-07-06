# Image Processing Backend

A scalable, queue-based image processing API built with FastAPI, designed for AWS deployment.

## Features

- ✅ **Background Removal** - Remove backgrounds from images using AI (queue-based processing)
- ✅ **Batch Processing** - Process up to 10 images simultaneously
- 🔄 **Background Changing** - Replace image backgrounds (coming soon)
- 🔄 **Sky Replacement** - Replace skies in landscape images (coming soon)
- 🔄 **Outpainting** - Extend images beyond their borders (coming soon)

## Architecture

- **FastAPI** - Modern, fast web framework
- **Queue-based Processing** - RabbitMQ (local) / AWS SQS (production)
- **Scalable Storage** - Local filesystem / AWS S3
- **Microservices** - Modular service architecture
- **AWS Ready** - ECS Fargate deployment configurations

## Quick Start

### Prerequisites

- Python 3.11+
- RabbitMQ (for local development)

### Installation

```bash
# 1. Install RabbitMQ (macOS)
brew install rabbitmq
brew services start rabbitmq

# 2. Start the backend
./start.sh

# 3. Start workers (in another terminal)
./start-worker.sh
```

### Test the Setup

```bash
# Run setup verification
python test_setup.py
```

### Access the API

- **API**: http://localhost:8000
- **Interactive Docs**: http://localhost:8000/docs
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)

## API Endpoints

### Background Removal

```bash
# Queue a job
curl -X POST "http://localhost:8000/api/v1/background-removal/process" \
     -H "accept: application/json" \
     -H "Content-Type: multipart/form-data" \
     -F "file=@your_image.jpg"

# Check job status
curl "http://localhost:8000/api/v1/background-removal/status/{job_id}"

# Download result
curl "http://localhost:8000/api/v1/background-removal/result/{job_id}" \
     --output processed_image.png

# Submit batch job
curl -X POST "http://localhost:8000/api/v1/background-removal/process-batch" \
     -H "accept: application/json" \
     -H "Content-Type: multipart/form-data" \
     -F "files=@image1.jpg" \
     -F "files=@image2.jpg"

# Check batch status  
curl "http://localhost:8000/api/v1/background-removal/batch-status/{batch_id}"

# Download batch results as ZIP
curl "http://localhost:8000/api/v1/background-removal/batch-results/{batch_id}" \
     --output batch_results.zip
```

## Project Structure

```
backend/
├── config/                 # Configuration management
├── core/                   # Shared components
│   ├── messaging/          # Queue abstraction (RabbitMQ/SQS)
│   ├── storage/           # Storage abstraction (Local/S3)
│   └── models/            # Shared data models
├── services/              # AI processing services
│   └── background_removal/ # Background removal service
├── workers/               # Background job processors
├── deployment/            # Docker and AWS configs
├── tests/                 # Test suite
└── requirements/          # Environment-specific dependencies
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Queue type: rabbitmq (local) or sqs (AWS)
QUEUE_TYPE=rabbitmq

# Storage type: local or s3
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=./uploads

# AWS settings (for production)
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket
```

## Development

### Adding New Services

1. Create service directory: `services/your_service/`
2. Implement processor: `processor.py`
3. Implement service layer: `service.py`
4. Create API routes: `router.py`
5. Add to main.py router includes

### Running Tests

```bash
pytest
```

### Code Quality

```bash
black .
isort .
flake8 .
```

## AWS Deployment

See [deployment/aws/DEPLOYMENT_GUIDE.md](deployment/aws/DEPLOYMENT_GUIDE.md) for detailed AWS deployment instructions.

### Quick AWS Deploy with Docker

```bash
# Build and deploy with docker-compose
docker-compose -f deployment/docker/docker-compose.prod.yml up
```

## Monitoring

- **Health Check**: `/health`
- **Service Stats**: `/api/v1/background-removal/stats`
- **Queue Metrics**: Monitored via CloudWatch (AWS) or RabbitMQ Management

## Scaling

### Local Development
- Multiple worker processes: Run `./start-worker.sh` in multiple terminals

### AWS Production
- **API Auto-scaling**: Based on CPU/memory usage
- **Worker Auto-scaling**: Based on queue depth
- **Storage**: Unlimited S3 capacity

## Troubleshooting

### Common Issues

1. **Import Errors**: Run `python test_setup.py` to verify setup
2. **RabbitMQ Connection**: Check if RabbitMQ is running
3. **Permission Errors**: Ensure proper AWS IAM roles (production)

### Logs

```bash
# View application logs
tail -f logs/app.log

# View worker logs
tail -f logs/worker.log
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details
