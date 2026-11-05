#!/usr/bin/env sh
# Backs up the database and the private document storage.
# Usage: DATABASE_URL=... STORAGE_DIR=./storage BACKUP_DIR=./backups scripts/backup.sh
set -eu
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=${BACKUP_DIR:-./backups}
STORAGE_DIR=${STORAGE_DIR:-./storage}
mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner "$DATABASE_URL" > "$BACKUP_DIR/db-$STAMP.dump"
tar -czf "$BACKUP_DIR/storage-$STAMP.tar.gz" --exclude=.ocr-cache -C "$STORAGE_DIR" .
echo "Backup written: $BACKUP_DIR/db-$STAMP.dump and $BACKUP_DIR/storage-$STAMP.tar.gz"
# Restore: pg_restore --clean --no-owner -d "$DATABASE_URL" db-<stamp>.dump && tar -xzf storage-<stamp>.tar.gz -C "$STORAGE_DIR"
