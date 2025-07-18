#!/bin/bash

# Clear cache on Google Cloud deployment
echo "🧹 Clearing App Store Cache on Google Cloud"
echo "========================================="

# Get the service URL
SERVICE_NAME=${1:-interspace-backend-dev}
REGION=${2:-us-central1}

echo "Service: $SERVICE_NAME"
echo "Region: $REGION"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
    echo "❌ Could not find service URL for $SERVICE_NAME in $REGION"
    echo ""
    echo "Available services:"
    gcloud run services list --format="table(SERVICE,REGION)"
    exit 1
fi

echo "✅ Service URL: $SERVICE_URL"

# Call the clear cache endpoint (if it exists)
# Note: You might need to add this endpoint to your backend
echo ""
echo "Attempting to clear cache via API..."

# Try to call a cache clear endpoint
curl -X POST "$SERVICE_URL/api/v2/admin/clear-cache" \
  -H "Content-Type: application/json" \
  -d '{"target": "app-store"}' \
  --fail --silent --show-error

if [ $? -eq 0 ]; then
    echo "✅ Cache cleared via API"
else
    echo "⚠️  No cache clear endpoint available"
    echo ""
    echo "Alternative: Restart the service to clear in-memory cache"
    echo "Run: gcloud run services update $SERVICE_NAME --region=$REGION --no-traffic"
    echo "Then: gcloud run services update $SERVICE_NAME --region=$REGION --traffic=100"
fi

echo ""
echo "📱 Testing App Store endpoints..."

# Test categories endpoint
echo ""
echo "Categories endpoint:"
curl -s "$SERVICE_URL/api/v2/app-store/categories" | jq '.data | length' | xargs -I {} echo "  Categories: {}"

# Test apps endpoint
echo "Apps endpoint:"
curl -s "$SERVICE_URL/api/v2/app-store/apps?limit=5" | jq '.data | length' | xargs -I {} echo "  Apps returned: {}"

# Check for Fileverse
echo "Fileverse check:"
curl -s "$SERVICE_URL/api/v2/app-store/apps?q=fileverse" | jq '.data | length' | xargs -I {} echo "  Search results: {}"

echo ""
echo "✅ Done!"