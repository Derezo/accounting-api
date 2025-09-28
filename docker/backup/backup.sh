#!/bin/bash

# Backup script for PostgreSQL database
# Bank-level security and compliance requirements

set -e

# Configuration
DB_HOST="postgres"
DB_PORT="5432"
DB_NAME="accounting_db"
DB_USER="postgres"
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/accounting_backup_$DATE.sql"
RETENTION_DAYS=30

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting database backup at $(date)"

# Create compressed backup with all necessary options
pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-password \
    --verbose \
    --format=custom \
    --compress=9 \
    --no-privileges \
    --no-owner \
    --file="$BACKUP_FILE.gz"

# Verify backup integrity
if pg_restore --list "$BACKUP_FILE.gz" > /dev/null 2>&1; then
    echo "Backup created successfully: $BACKUP_FILE.gz"
    echo "Backup size: $(du -h "$BACKUP_FILE.gz" | cut -f1)"
else
    echo "ERROR: Backup verification failed!"
    exit 1
fi

# Create a plain SQL backup for easier reading
pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-password \
    --verbose \
    --format=plain \
    --no-privileges \
    --no-owner \
    --file="$BACKUP_FILE"

# Compress the plain backup
gzip "$BACKUP_FILE"

# Create backup metadata
cat > "$BACKUP_DIR/backup_$DATE.json" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "database": "$DB_NAME",
    "host": "$DB_HOST",
    "backup_file": "$(basename "$BACKUP_FILE.gz")",
    "custom_backup_file": "$(basename "$BACKUP_FILE.gz")",
    "size_bytes": $(stat -c%s "$BACKUP_FILE.gz"),
    "checksum": "$(sha256sum "$BACKUP_FILE.gz" | cut -d' ' -f1)"
}
EOF

# Clean up old backups (keep only last 30 days)
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -name "accounting_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "backup_*.json" -mtime +$RETENTION_DAYS -delete

echo "Backup completed successfully at $(date)"

# List current backups
echo "Current backups:"
ls -lah "$BACKUP_DIR"/accounting_backup_*.sql.gz | tail -5