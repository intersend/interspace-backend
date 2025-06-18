#!/bin/sh

# Docker health check script
# Returns 0 if healthy, 1 if unhealthy

# Check if the application is responding
if wget --no-verbose --tries=1 --spider http://localhost:3000/health 2>/dev/null; then
    # Check if the response indicates healthy status
    response=$(wget -qO- http://localhost:3000/health)
    if echo "$response" | grep -q '"status":"healthy"'; then
        exit 0
    else
        echo "Health check returned unhealthy status"
        exit 1
    fi
else
    echo "Health check endpoint not responding"
    exit 1
fi