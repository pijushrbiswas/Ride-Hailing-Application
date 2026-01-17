#!/bin/bash

# DANGER: This will DELETE all data!
# Only use when you want to start fresh

echo "⚠️  WARNING: This will delete all database data!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" = "yes" ]; then
    echo "🗑️  Deleting volumes and restarting..."
    docker compose down -v
    docker compose up -d
    echo "✅ Clean restart complete"
else
    echo "❌ Cancelled"
fi
