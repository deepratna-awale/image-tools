# Image Processing Backend - Architecture

## Current Features
- ✅ Background Removal with batch processing (up to 10 images)
- 🔄 Background Changing (planned)
- 🔄 Sky Replacement (planned)
- 🔄 Outpainting (planned)

## Architecture Overview

### Modular Service-Based Structure
```
backend/
├── main.py                    # Main FastAPI app with routing
├── config/
│   ├── __init__.py
│   ├── settings.py            # Environment configuration
│   └── aws_config.py          # AWS-specific settings
├── core/
│   ├── __init__.py
│   ├── messaging/             # RabbitMQ/SQS abstraction
│   │   ├── __init__.py
│   │   ├── queue_manager.py   # Abstract queue interface
│   │   ├── rabbitmq_adapter.py
│   │   └── sqs_adapter.py     # For AWS deployment
│   ├── storage/               # File storage abstraction
│   │   ├── __init__.py
│   │   ├── storage_manager.py
│   │   ├── local_storage.py
│   │   └── s3_storage.py      # AWS S3 integration
│   ├── models/                # Shared data models
│   │   ├── __init__.py
│   │   ├── job.py
│   │   └── responses.py
│   └── middleware/            # Authentication, CORS, etc.
│       ├── __init__.py
│       ├── auth.py
│       └── rate_limiting.py
├── services/                  # Individual AI services
│   ├── __init__.py
│   ├── background_removal/
│   │   ├── __init__.py
│   │   ├── router.py          # FastAPI routes
│   │   ├── service.py         # Business logic
│   │   ├── processor.py       # AI processing
│   │   └── models.py          # Service-specific models
│   ├── background_changing/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   ├── service.py
│   │   ├── processor.py
│   │   └── models.py
│   ├── sky_replacement/
│   │   ├── __init__.py
│   │   ├── router.py
│   │   ├── service.py
│   │   ├── processor.py
│   │   └── models.py
│   └── outpainting/
│       ├── __init__.py
│       ├── router.py
│       ├── service.py
│       ├── processor.py
│       └── models.py
├── workers/                   # Background processing workers
│   ├── __init__.py
│   ├── worker_manager.py      # Worker coordination
│   └── image_processor.py     # Generic image processing worker
├── api/                       # API layer
│   ├── __init__.py
│   ├── v1/                    # API versioning
│   │   ├── __init__.py
│   │   └── routes.py
│   └── dependencies.py        # FastAPI dependencies
├── tests/
├── deployment/                # AWS deployment configs
│   ├── docker/
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   └── docker-compose.prod.yml
│   ├── aws/
│   │   ├── cloudformation/
│   │   ├── terraform/
│   │   └── ecs/
│   └── k8s/                   # Kubernetes configs
└── requirements/
    ├── base.txt
    ├── dev.txt
    ├── prod.txt
    └── aws.txt
```

## AWS Deployment Strategy

### Option 1: ECS Fargate (Recommended)
- **API Service**: FastAPI app on ECS Fargate
- **Worker Service**: Background workers on ECS Fargate
- **Queue**: AWS SQS + DLQ for failed jobs
- **Storage**: S3 for images, RDS/DynamoDB for job metadata
- **Load Balancer**: Application Load Balancer
- **Scaling**: Auto-scaling based on queue depth

### Option 2: Lambda + ECS Hybrid
- **API**: Lambda functions for lightweight operations
- **Heavy Processing**: ECS Fargate for AI models
- **Queue**: SQS with Lambda triggers
- **Storage**: S3 + DynamoDB

### Option 3: EKS (For advanced scaling)
- **Kubernetes**: Full container orchestration
- **HPA**: Horizontal Pod Autoscaler
- **GPU Nodes**: For AI model acceleration

## Benefits of This Architecture

1. **Modularity**: Each service is independent and can be deployed separately
2. **Scalability**: Services can be scaled individually based on demand
3. **Maintainability**: Clear separation of concerns makes code easier to maintain
4. **Testability**: Each component can be tested in isolation
5. **AWS-Ready**: Designed for easy deployment on AWS services (ECS, SQS, S3)
6. **Queue-Based**: All processing is asynchronous and scalable
7. **Batch Support**: Efficient handling of multiple images simultaneously

## Implementation Status

### ✅ Completed
- Background removal service with queue-based processing
- Batch processing support (up to 10 images)
- Modular service architecture
- RabbitMQ/SQS queue abstraction
- Local/S3 storage abstraction
- Comprehensive test suite
- Docker deployment configuration
- AWS deployment templates

### 🔄 In Progress
- Additional AI services (background changing, sky replacement, outpainting)
- Enhanced error handling and monitoring
- Performance optimizations

### 📋 Planned
- Redis integration for shared state
- WebSocket real-time notifications
- Advanced authentication and authorization
- Kubernetes deployment options
