#!/bin/bash

echo "🔐 Reset Google Cloud SQL Password"
echo "=================================="
echo ""
echo "Choose which user to reset:"
echo "1) postgres (superuser)"
echo "2) interspace_dev"
echo ""
read -p "Enter choice (1 or 2): " choice

case $choice in
    1)
        USER="postgres"
        ;;
    2)
        USER="interspace_dev"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "You'll reset password for user: $USER"
echo ""

# Generate a random password
NEW_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

echo "Generated password: $NEW_PASSWORD"
echo ""
echo "Setting password..."

# Set the password
gcloud sql users set-password $USER \
    --instance=interspace-db-dev \
    --password="$NEW_PASSWORD"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Password reset successfully!"
    echo ""
    echo "Save this password securely:"
    echo "User: $USER"
    echo "Password: $NEW_PASSWORD"
    echo ""
    echo "Now you can run the import:"
    echo "./scripts/import-cloud-simple.sh $NEW_PASSWORD"
else
    echo "❌ Failed to reset password"
fi