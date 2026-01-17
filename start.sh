#!/bin/bash

# 🚗 Ride Hailing Application - Quick Start Script
# This script starts the entire application with frontend

set -e

echo "=================================="
echo "🚗 Ride Hailing Quick Start"
echo "=================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start backend services
echo "📦 Starting backend services (PostgreSQL, Redis, API, Worker)..."
cd infra
docker compose up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo "🏥 Checking backend health..."
HEALTH=$(curl -s http://localhost:3000/health | grep -o "ok" || echo "failed")

if [ "$HEALTH" != "ok" ]; then
    echo "❌ Backend health check failed. Check logs with: docker logs ride-api"
    exit 1
fi

echo "✅ Backend is healthy"
echo ""

# Start frontend
echo "🎨 Starting frontend dashboard..."
cd ../frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Start frontend server in background
nohup node server.js > frontend.log 2>&1 &
FRONTEND_PID=$!

echo "⏳ Waiting for frontend to start..."
sleep 3

# Check frontend
FRONTEND_CHECK=$(curl -s http://localhost:8080 | grep -o "title" || echo "failed")

if [ "$FRONTEND_CHECK" != "title" ]; then
    echo "❌ Frontend failed to start. Check frontend.log for errors."
    exit 1
fi

echo "✅ Frontend is running (PID: $FRONTEND_PID)"
echo ""

# Summary
echo "=================================="
echo "🎉 All services are running!"
echo "=================================="
echo ""
echo "📊 Live Dashboard:    http://localhost:8080"
echo "🔌 Backend API:       http://localhost:3000"
echo "📚 API Docs:          http://localhost:3000/health"
echo ""
echo "📝 Available Endpoints:"
echo "  • GET  /v1/rides        - Get all rides"
echo "  • POST /v1/rides        - Request a ride"
echo "  • GET  /v1/drivers      - Get all drivers"
echo "  • POST /v1/drivers      - Create a driver"
echo ""
echo "🛠️  Useful Commands:"
echo "  • View backend logs:   docker logs ride-api"
echo "  • View frontend logs:  tail -f frontend/frontend.log"
echo "  • Stop services:       docker compose down"
echo "  • Stop frontend:       kill $FRONTEND_PID"
echo ""
echo "✨ Open http://localhost:8080 in your browser to get started!"
echo ""
