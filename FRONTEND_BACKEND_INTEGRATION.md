# Frontend-Backend Integration Guide

This document explains how the frontend has been corrected to properly communicate with the backend.

## Changes Made

### 1. API Endpoint Corrections
- **Fixed endpoint URLs**: Updated to use the correct backend API paths (`/api/v1/background-removal/process`)
- **Added proper error handling**: API routes now handle backend errors gracefully
- **Created dedicated API routes**: Separate routes for job submission, status checking, and result retrieval

### 2. Environment Configuration
- **Added environment variables**: Created `.env.local` with backend URL configuration
- **Updated Next.js config**: Added API proxy and environment variable support

### 3. API Routes Created/Updated
- `/api/remove-background/route.ts` - Submit background removal jobs
- `/api/background-removal/status/[jobId]/route.ts` - Check job status  
- `/api/background-removal/result/[jobId]/route.ts` - Download processed images
- `/api/remove-background-direct/route.ts` - Direct processing without queuing
- `/api/health/route.ts` - Backend health check

### 4. Frontend Improvements
- **Enhanced UI**: Added job status polling, progress indicators, and result display
- **Two processing modes**: Queue-based and direct processing options
- **Better error handling**: Clear error messages and status updates
- **Image preview**: Display processed images before download
- **Health monitoring**: Visual backend connectivity status

### 5. Utility Layer
- **API abstraction**: Created `lib/api.ts` with typed API calls
- **Type safety**: Added proper TypeScript interfaces for API responses

## Backend API Endpoints Expected

The frontend expects these backend endpoints to be available:

```
GET  /health - Health check
POST /api/v1/background-removal/process - Submit job
GET  /api/v1/background-removal/status/{job_id} - Job status
GET  /api/v1/background-removal/result/{job_id} - Download result
POST /api/v1/background-removal/process-direct - Direct processing
```

## Environment Variables

Create a `.env.local` file in the frontend directory:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
BACKEND_URL=http://localhost:8000
```

## Starting the Application

### Option 1: Start Backend First
```bash
# Terminal 1 - Backend
cd backend
./start.sh

# Terminal 2 - Frontend  
cd frontend
./start.sh
```

### Option 2: Use Development Scripts
```bash
# Frontend with backend check
cd frontend
pnpm run dev:with-backend
```

## Features

### Background Removal Page (`/bg-remover`)
- **File upload**: Drag and drop image files
- **Two processing modes**:
  - Queue-based: Submit job and poll for completion
  - Direct: Process immediately and return result
- **Real-time status**: Live updates during processing
- **Result preview**: Show processed image
- **Download**: Save processed images

### Health Check
- Visual indicator of backend connectivity
- Automatic retry capability
- Displays backend version and service status

## Troubleshooting

### Common Issues

1. **"Backend not responding"**
   - Ensure backend is running on localhost:8000
   - Check backend health: `curl http://localhost:8000/health`

2. **CORS errors**
   - Backend CORS is configured for `*` origins
   - Check backend `config/settings.py` for CORS settings

3. **API endpoint not found**
   - Verify backend API prefix in `config/settings.py`
   - Check that all services are properly registered

4. **File upload issues**
   - Check backend `max_file_size` setting
   - Ensure uploaded files are valid images

### Backend Verification
```bash
# Check if backend is healthy
curl http://localhost:8000/health

# Test background removal endpoint
curl -X POST -F "file=@test.jpg" http://localhost:8000/api/v1/background-removal/process
```

## API Response Formats

### Job Submission Response
```json
{
  "job_id": "uuid-string",
  "status": "queued",
  "message": "Job submitted successfully",
  "service_type": "background_removal"
}
```

### Job Status Response
```json
{
  "job_id": "uuid-string", 
  "status": "completed|processing|failed",
  "progress": 100,
  "error_message": null
}
```

### Health Response
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "api": "healthy",
    "queue": "healthy", 
    "storage": "healthy"
  }
}
```

The frontend now properly integrates with the backend and provides a smooth user experience for image processing tasks.
