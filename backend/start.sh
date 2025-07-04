#!/bin/bash

# Image Processing Backend Startup Script
echo "🚀 Starting Image Processing Backend..."

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source .venv/bin/activate

# Install dependencies
echo "📚 Installing dependencies..."
pip install -r requirements/base.txt

# Check if RabbitMQ is running (for local development)
if ! pgrep -x "rabbitmq-server" > /dev/null; then
    echo "🐰 Starting RabbitMQ..."
    if command -v brew &> /dev/null; then
        brew services start rabbitmq
    else
        echo "⚠️  Please start RabbitMQ manually or use Docker:"
        echo "   docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management"
    fi
fi

# Create storage directory
echo "📁 Creating storage directory..."
mkdir -p ./uploads

# Set environment variables for local development
export QUEUE_TYPE=rabbitmq
export STORAGE_TYPE=local
export LOCAL_STORAGE_PATH=./uploads
export DEBUG=true
export LOG_LEVEL=INFO

echo "✅ Setup complete!"
echo ""
echo "🌐 Starting API server..."
echo "   API: http://localhost:8000"
echo "   Docs: http://localhost:8000/docs"
echo "   RabbitMQ Management: http://localhost:15672 (guest/guest)"
echo ""

# Start the API server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
