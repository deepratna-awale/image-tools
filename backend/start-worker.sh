#!/bin/bash

# Image Processing Worker Startup Script
echo "⚙️  Starting Image Processing Worker..."

# Activate virtual environment
if [ -d ".venv" ]; then
    source .venv/bin/activate
else
    echo "❌ Virtual environment not found. Run start.sh first."
    exit 1
fi

# Set environment variables for local development
export QUEUE_TYPE=rabbitmq
export STORAGE_TYPE=local
export LOCAL_STORAGE_PATH=./uploads
export LOG_LEVEL=INFO

echo "🔄 Starting worker process..."
echo "   Processing jobs from RabbitMQ queues"
echo "   Storage: ./uploads"
echo ""

# Start the worker
python -m workers.image_processor
