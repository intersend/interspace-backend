# Production Database Management

This guide covers recommended PostgreSQL settings for running the Interspace backend in production.

## Connection Pooling

To avoid exhausting database connections under load, use a connection pool.

### Using pgbouncer
1. Deploy a `pgbouncer` instance alongside your database or use your provider's built-in pooling feature.
2. Point `DATABASE_URL` at the pgbouncer port (commonly `6432`). Example:
   ```
   DATABASE_URL="postgresql://user:pass@pgbouncer-host:6432/interspace"
   ```
3. Set an appropriate pool size (e.g., 20 connections) based on your database plan.

### Prisma `connection_limit`
Alternatively, limit Prisma's own pool by adding `connection_limit` to the connection string:
```bash
DATABASE_URL="postgresql://user:pass@db:5432/interspace?connection_limit=10"
```
Adjust the value to match your available connections.

## Automated Backups

Regular backups protect against accidental data loss.

### `pg_dump` Cron Job
On self-hosted PostgreSQL servers you can create a daily backup script:
```bash
pg_dump $DATABASE_URL > /var/backups/interspace_$(date +%F).sql
```
Schedule it with cron:
```
0 2 * * * /path/to/backup.sh
```

### Managed Service Snapshots
If using a managed database (e.g., Google Cloud SQL, Supabase, Neon), enable automated snapshots in the provider dashboard. Retain backups for at least seven days.

## Read-Only Replica

For high availability and scaling reads:
1. Enable replication or create a read-only replica using your provider's tools.
2. Configure the application to use the replica for read operations. With Prisma you can set `readUrls` in `schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
     // readUrls can direct queries to the replica
     // readUrls = [env("DATABASE_READONLY_URL")]
   }
   ```
3. Keep the replica in the same region as the primary to minimize latency.
