# App Store Public Database Setup Guide

This guide explains how to set up a separate public database for the App Store that can be accessed from anywhere without authentication.

## Why a Separate Public Database?

- **Security**: Keeps user data completely separate from public app data
- **Performance**: Dedicated database for app store queries
- **Scalability**: Can be scaled independently
- **Accessibility**: Public IP allows access from any client without VPN/proxy

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  iOS App    │────▶│  Backend API     │────▶│ Main Database   │
│             │     │                  │     │ (Private)       │
│             │     │                  │     └─────────────────┘
│             │     │                  │
│             │     │                  │     ┌─────────────────┐
│             │────▶│  App Store API   │────▶│ AppStore DB     │
└─────────────┘     └──────────────────┘     │ (Public)        │
                                              └─────────────────┘
```

## Setup Steps

### 1. Authenticate with Google Cloud

```bash
gcloud auth login
gcloud config set project intersend
```

### 2. Create Public App Store Database

Run the creation script:
```bash
./scripts/create-public-appstore-db.sh
```

This will:
- Create a Cloud SQL instance with public IP
- Enable access from all networks (0.0.0.0/0)
- Create database and user
- Output connection details

### 3. Complete Setup

If the creation was interrupted, run:
```bash
./scripts/complete-appstore-setup.sh
```

This will:
- Check instance status
- Create database and user if needed
- Add APPSTORE_DATABASE_URL to .env
- Generate Prisma client
- Run migrations

### 4. Import App Data

Import your apps from the JSON file:
```bash
npm run appstore:import
```

Or specify a custom file:
```bash
npm run appstore:import /path/to/apps.json
```

### 5. Verify Import

Check that apps were imported:
```bash
npm run appstore:verify
```

### 6. Deploy Backend

Update your Cloud Run deployment with the new environment variable:

```bash
gcloud run services update interspace-backend-dev \
  --region=us-central1 \
  --update-env-vars="APPSTORE_DATABASE_URL=postgresql://appstore_user:AppStoreUser2024!@PUBLIC_IP:5432/appstore"
```

## Database Details

- **Instance**: interspace-appstore-public
- **Database**: appstore
- **User**: appstore_user
- **Password**: AppStoreUser2024!
- **Public IP**: (shown after creation)

## Security Considerations

1. **Network Access**: Currently allows all IPs (0.0.0.0/0). Consider restricting to:
   - Your office/home IP
   - Cloud Run service IPs
   - Specific client IPs

2. **SSL**: Enable SSL for production:
   ```bash
   gcloud sql instances patch interspace-appstore-public --require-ssl
   ```

3. **Passwords**: Change default passwords for production

## Maintenance

### Update Apps
```bash
npm run appstore:import
```

### Clear and Re-import
```bash
# Clear existing data
psql $APPSTORE_DATABASE_URL -c "DELETE FROM \"AppStoreApp\"; DELETE FROM \"AppStoreCategory\";"

# Re-import
npm run appstore:import
```

### Backup Database
```bash
gcloud sql backups create --instance=interspace-appstore-public
```

## Troubleshooting

### Connection Issues
1. Check instance is running:
   ```bash
   gcloud sql instances describe interspace-appstore-public
   ```

2. Test connection:
   ```bash
   psql $APPSTORE_DATABASE_URL -c "SELECT COUNT(*) FROM \"AppStoreApp\";"
   ```

### Migration Issues
1. Reset and re-run:
   ```bash
   npx prisma migrate reset --schema=./prisma/schema.appstore.prisma
   ```

2. Check migration status:
   ```bash
   npx prisma migrate status --schema=./prisma/schema.appstore.prisma
   ```

## Cost Optimization

- The `db-f1-micro` instance costs ~$10/month
- Consider using Cloud SQL sleep/wake schedules for dev
- Monitor usage with:
  ```bash
  gcloud sql instances describe interspace-appstore-public --format="table(currentDiskSize,settings.dataDiskSizeGb)"
  ```

## Next Steps

1. Configure SSL certificates
2. Set up automated backups
3. Create read replicas for different regions
4. Implement caching layer (Redis)
5. Add monitoring and alerts