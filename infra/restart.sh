#!/bin/bash

# Restart services WITHOUT deleting volumes (preserves data)
# Use this instead of "docker compose down -v"

echo "🔄 Restarting services (keeping data)..."

docker compose down
docker compose up -d

echo "✅ Services restarted"
echo "📊 Check status:"
docker compose ps
