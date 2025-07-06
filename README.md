# Image Tools

AI-powered image processing platform with background removal, background changing, sky replacement, and outpainting capabilities.

## 🚀 Features

- **Background Removal**: Remove backgrounds from images using AI models ✅
- **Background Changing**: Replace backgrounds with custom images or colors 🔄
- **Sky Replacement**: Change sky in landscape photos 🔄  
- **Outpainting**: Extend images beyond their original boundaries 🔄
- **Batch Processing**: Process up to 10 images simultaneously with ZIP download
- **Queue-based Processing**: Scalable job processing with RabbitMQ/SQS
- **Real-time Status Updates**: Track processing progress in real-time
- **Multiple Storage Options**: Local filesystem and AWS S3 support
- **AWS Ready**: ECS Fargate deployment configurations included

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Frontend     │    │     Backend     │    │     Worker      │
│   (Next.js)     │────│   (FastAPI)     │────│   Processes     │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Files    │    │   Queue System  │    │   Storage       │
│   (Uploads)     │    │   (RabbitMQ)    │    │ (Local/S3)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack

**Frontend:**
- Next.js 15 with App Router
- TypeScript
- Tailwind CSS
- Shadcn/ui Components
- React Hook Form

**Backend:**
- FastAPI (Python)
- Pydantic for data validation
- AsyncIO for async operations
- Modular service architecture

**Processing:**
- RemBG for background removal
- PIL/Pillow for image manipulation
- NumPy for image array operations

**Infrastructure:**
- RabbitMQ for job queuing
- Redis (optional) for shared state
- Docker & Docker Compose
- AWS S3 (optional) for storage

## 🚦 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- pnpm (recommended) or npm
- Docker (optional)
- RabbitMQ (installed locally or via Docker)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd image-tools
   ```

2. **Start the backend**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your configuration
   ./start.sh
   ```

3. **Start the frontend**
   ```bash
   cd frontend
   cp .env.example .env.local
   # Edit .env.local with your configuration
   pnpm install
   pnpm dev
   ```

4. **Start the worker** (in a new terminal)
   ```bash
   cd backend
   ./start-worker.sh
   ```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### Docker Setup

```bash
# Start all services with Docker Compose
cd backend/deployment/docker
docker-compose up -d

# Or for development
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## 📁 Project Structure

```
image-tools/
├── frontend/                 # Next.js frontend application
│   ├── app/                 # App router pages and components
│   ├── components/          # Reusable UI components
│   ├── lib/                 # Utilities and API clients
│   └── public/              # Static assets
├── backend/                 # FastAPI backend application
│   ├── core/                # Core business logic
│   │   ├── models/          # Data models
│   │   ├── messaging/       # Queue management
│   │   └── storage/         # File storage
│   ├── services/            # Service implementations
│   │   └── background_removal/
│   ├── workers/             # Background job processors
│   ├── config/              # Configuration
│   └── deployment/          # Docker and deployment configs
├── docs/                    # Documentation
└── scripts/                 # Utility scripts
```

## 🔧 Configuration

### Backend Configuration

Key environment variables in `backend/.env`:

```env
# API Configuration
API_HOST=localhost
API_PORT=8000
API_PREFIX=/api/v1

# Queue Configuration
QUEUE_TYPE=rabbitmq
RABBITMQ_URL=amqp://guest:guest@localhost/

# Storage Configuration
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=./uploads
# For S3:
# STORAGE_TYPE=s3
# S3_BUCKET_NAME=your-bucket
# AWS_ACCESS_KEY_ID=your-key
# AWS_SECRET_ACCESS_KEY=your-secret

# Processing
MAX_FILE_SIZE_MB=50
ALLOWED_EXTENSIONS=jpg,jpeg,png,webp
```

### Frontend Configuration

Key environment variables in `frontend/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
BACKEND_URL=http://localhost:8000
```

## 🎯 Usage

### Background Removal

1. Navigate to `/bg-remover`
2. Upload image(s) using drag & drop (supports up to 10 images)
3. Processing is queue-based with real-time progress tracking
4. For single images: Download the processed image when complete
5. For multiple images: View results in a responsive grid layout
6. Download all processed images as a ZIP file using "Download All" button

#### Single Image Processing
- Upload one image
- Processing happens through the queue system with status updates

#### Batch Processing (2-10 images)
- Upload multiple images (up to 10)
- Images are displayed in a grid preview
- Processing happens for all images simultaneously through the queue
- Results are shown in a responsive grid layout
- Each image has its own download button
- "Download All (ZIP)" button downloads all processed images as a zip file

### API Usage

```bash
# Submit a single background removal job
curl -X POST \
  -F "file=@your-image.jpg" \
  http://localhost:8000/api/v1/background-removal/process

# Submit a batch background removal job
curl -X POST \
  -F "files=@image1.jpg" \
  -F "files=@image2.jpg" \
  -F "files=@image3.jpg" \
  http://localhost:8000/api/v1/background-removal/process-batch

# Check job status
curl http://localhost:8000/api/v1/background-removal/status/{job_id}

# Check batch job status
curl http://localhost:8000/api/v1/background-removal/batch-status/{batch_id}

# Download single result
curl http://localhost:8000/api/v1/background-removal/result/{job_id} \
  -o processed-image.png

# Download batch results as ZIP
curl http://localhost:8000/api/v1/background-removal/batch-results/{batch_id} \
  -o batch-results.zip
```
## 🔄 Workflow

### Job Processing Flow

1. **Upload**: User uploads image via frontend
2. **Queue**: Job is queued in RabbitMQ
3. **Process**: Worker picks up job and processes image
4. **Store**: Result is saved to storage
5. **Notify**: Status is updated and user can download result

### Cross-Process Communication

The system handles cross-process communication between the API server and worker processes through:
- **File-based status detection**: Workers save results to known locations
- **Queue messaging**: Jobs are distributed via RabbitMQ
- **Storage layer**: Shared storage for input/output files

## 🧪 Testing

### Backend Tests
```bash
cd backend
python -m pytest tests/
```

### Frontend Tests
```bash
cd frontend
pnpm test
```

### Integration Tests
```bash
# Test full workflow
cd backend
python test_real_image_workflow.py
```

## 📊 Monitoring

### Health Checks
- API Health: `GET /health`
- Frontend Health Check: Built into UI
- Queue Stats: `GET /api/v1/background-removal/stats`

### Logging
- Backend: Structured logging with configurable levels
- Worker: Separate log files for job processing
- Frontend: Browser console and error boundaries

## 🚀 Deployment

### Production Deployment

1. **Docker Production Setup**
   ```bash
   cd backend/deployment/docker
   docker-compose -f docker-compose.prod.yml up -d
   ```

2. **AWS ECS Deployment**
   See `backend/deployment/aws/DEPLOYMENT_GUIDE.md`

3. **Environment Configuration**
   - Use proper environment files for production
   - Configure S3 for file storage
   - Set up proper queue infrastructure
   - Configure logging and monitoring

### Security Considerations

- Environment variables for sensitive data
- File upload validation and size limits
- CORS configuration for production domains
- Rate limiting (recommended)
- Authentication (to be implemented)

## 🛠️ Development

### Adding New Services

1. Create service directory in `backend/services/`
2. Implement service class with `process_job` method
3. Add service to `ServiceType` enum
4. Register service in worker
5. Create API router
6. Add frontend integration

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📚 Documentation

- [Backend Architecture](./backend/ARCHITECTURE.md)
- [Backend Testing Documentation](./backend/TESTING_DOCUMENTATION.md)
- [AWS Deployment Guide](./backend/deployment/aws/DEPLOYMENT_GUIDE.md)
- [API Documentation](http://localhost:8000/docs) (when running)

## ⚠️ Known Issues

- Job tracking relies on file-based status detection between API and workers
- In-memory job tracking doesn't scale (Redis recommended for production)
- Worker restart may cause job state loss without persistent storage

## 🗺️ Roadmap

- [x] Background removal with batch processing
- [x] Queue-based job processing
- [x] Real-time status updates
- [ ] Redis integration for shared job state
- [ ] User authentication and authorization  
- [ ] Additional AI models (background changing, sky replacement, outpainting)
- [ ] Real-time WebSocket notifications
- [ ] Performance optimizations
- [ ] Mobile app support

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Support

For questions and support:
- Create an issue in the repository
- Check the documentation
- Review the troubleshooting section

---

Built with ❤️ for the AI image processing community.
