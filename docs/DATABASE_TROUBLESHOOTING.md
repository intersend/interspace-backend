# Database Troubleshooting Guide

## Issue Summary
The backend service is unable to access database tables, specifically `siwe_nonces` and `blacklisted_tokens`, resulting in authentication failures for the iOS app.

## Root Cause Analysis

### 1. Database Connection
- The backend successfully connects to Cloud SQL instance `interspace-db-dev`
- Connection string is properly configured using Unix socket: `/cloudsql/intersend:us-central1:interspace-db-dev`
- Database name: `interspace_dev`
- User: `interspace_dev`

### 2. Persistent Table Access Issues
Despite multiple attempts to create tables through various methods:
- Prisma db push
- Prisma migrations
- Direct SQL creation with proper permissions

The backend service continues to report "table does not exist" errors.

### 3. Possible Causes
Based on extensive investigation and Google Cloud SQL research:

1. **Connection Context Mismatch**: The backend might be connecting with different credentials than expected
2. **Schema Isolation**: Tables might exist but in a different schema
3. **Permission Inheritance Issues**: Cloud SQL has complex permission inheritance that might be blocking access
4. **Service Account vs User Mismatch**: Tables created by Cloud Run jobs might not be accessible to the service

## Attempted Solutions

### 1. Database Reset Jobs
- Created multiple Cloud Run jobs to reset and recreate the database schema
- Jobs reported success but tables remained inaccessible to the backend

### 2. Permission Fixes
- Granted full permissions on public schema to `interspace_dev` user
- Set default privileges for future table creation
- Manually created tables with explicit ownership

### 3. Migration Approaches
- Tried both `prisma db push` and `prisma migrate deploy`
- Both approaches completed without errors but didn't resolve the issue

## Recommended Next Steps

### 1. Direct Database Investigation
Connect directly to the Cloud SQL instance through Cloud Console:
```sql
-- Check which database the backend is actually using
SELECT current_database(), current_user, current_schema;

-- List all databases
\l

-- Connect to interspace_dev
\c interspace_dev

-- List all schemas
\dn

-- List tables in all schemas
SELECT schemaname, tablename, tableowner 
FROM pg_tables 
ORDER BY schemaname, tablename;

-- Check for tables in non-public schemas
SELECT * FROM information_schema.tables 
WHERE table_name IN ('siwe_nonces', 'blacklisted_tokens');
```

### 2. Service Account Verification
Verify the backend is using the correct service account:
```bash
# Check service account used by Cloud Run
gcloud run services describe interspace-backend-dev \
  --region=us-central1 \
  --format="value(spec.template.spec.serviceAccountName)"

# Check IAM roles
gcloud projects get-iam-policy intersend \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:interspace-backend-dev@*"
```

### 3. Alternative Connection Test
Create a test endpoint in the backend that logs detailed connection information:
```typescript
app.get('/api/debug/db-info', async (req, res) => {
  try {
    const dbInfo = await prisma.$queryRaw`
      SELECT 
        current_database() as database,
        current_user as user,
        current_schemas(true) as schemas,
        version() as version
    `;
    
    const tables = await prisma.$queryRaw`
      SELECT schemaname, tablename 
      FROM pg_tables 
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename
    `;
    
    res.json({ dbInfo, tables });
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});
```

### 4. Fresh Database Creation
As a last resort, consider creating a new database:
```sql
-- Connect as postgres user
CREATE DATABASE interspace_dev_v2;
GRANT ALL PRIVILEGES ON DATABASE interspace_dev_v2 TO interspace_dev;

-- Update DATABASE_URL secret to point to new database
-- Run migrations on fresh database
```

## Monitoring Implementation

### 1. Health Check Endpoint
Add a comprehensive health check that verifies table access:
```typescript
app.get('/health/db', async (req, res) => {
  const checks = {
    connection: false,
    tables: {
      users: false,
      siwe_nonces: false,
      blacklisted_tokens: false
    }
  };
  
  try {
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    checks.connection = true;
    
    // Test table access
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'siwe_nonces', 'blacklisted_tokens')
    `;
    
    tables.forEach(t => {
      checks.tables[t.table_name] = true;
    });
    
    res.json({ healthy: Object.values(checks.tables).every(v => v), checks });
  } catch (error) {
    res.status(500).json({ healthy: false, checks, error: error.message });
  }
});
```

### 2. Deployment Verification
Add to deployment process:
1. Run migrations as part of Cloud Build
2. Verify table creation before routing traffic
3. Alert on database errors

## Conclusion

The issue appears to be a complex interaction between Cloud SQL permissions, service account contexts, and possibly schema isolation. Direct database investigation through Cloud Console is needed to determine the exact state and resolve the access issues.

## References
- [Cloud SQL IAM Roles](https://cloud.google.com/sql/docs/postgres/iam-roles)
- [Prisma Cloud SQL Connection](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-google-cloud-sql)
- [Cloud Run Service Accounts](https://cloud.google.com/run/docs/securing/service-identity)