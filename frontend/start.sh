#!/bin/bash

# Frontend Startup Script
echo "🎯 Starting Frontend Development Server..."

# Check if backend is running
echo "🔍 Checking if backend is available..."
if curl -s http://localhost:8000/health > /dev/null; then
    echo "✅ Backend is running"
else
    echo "⚠️  Backend not detected on localhost:8000"
    echo "   Please start the backend first with: cd ../backend && ./start.sh"
    echo "   Or run the frontend anyway? (y/n)"
    read -r response
    if [[ "$response" != "y" && "$response" != "Y" ]]; then
        echo "❌ Cancelled"
        exit 1
    fi
fi

echo "🚀 Starting Next.js development server..."
pnpm dev
