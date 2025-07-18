#!/bin/bash

echo "🚀 Quick App Store Setup (After Authentication)"
echo "=============================================="

# Step 1: Re-authenticate if needed
echo "Checking authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "Please run: gcloud auth login"
    exit 1
fi

echo "✅ Authenticated as: $(gcloud auth list --filter=status:ACTIVE --format='value(account)')"

# Step 2: Check if instance exists or create it
INSTANCE_NAME="interspace-appstore-public"
INSTANCE_STATE=$(gcloud sql instances describe $INSTANCE_NAME --format="value(state)" 2>/dev/null)

if [ -z "$INSTANCE_STATE" ]; then
    echo ""
    echo "Creating new instance..."
    ./scripts/create-public-appstore-db.sh
else
    echo "✅ Instance exists in state: $INSTANCE_STATE"
fi

# Step 3: Complete the setup
echo ""
./scripts/complete-appstore-setup.sh

# Step 4: Import apps
echo ""
echo "Importing apps..."
npm run appstore:import

# Step 5: Verify
echo ""
echo "Verifying import..."
npm run appstore:verify

echo ""
echo "✅ All done! Your public app store database is ready."
echo ""
echo "Next step: Deploy your backend with APPSTORE_DATABASE_URL"