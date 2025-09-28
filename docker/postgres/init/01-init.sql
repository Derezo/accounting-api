-- PostgreSQL initialization script for accounting API
-- Bank-level security configurations

-- Create database if not exists
SELECT 'CREATE DATABASE accounting_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'accounting_db');

-- Create shadow database for Prisma migrations
SELECT 'CREATE DATABASE accounting_shadow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'accounting_shadow');

-- Connect to the main database
\c accounting_db;

-- Create audit schema for tracking
CREATE SCHEMA IF NOT EXISTS audit;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create read-only user for reporting
CREATE ROLE accounting_reader WITH LOGIN PASSWORD 'reader_password';
GRANT CONNECT ON DATABASE accounting_db TO accounting_reader;
GRANT USAGE ON SCHEMA public TO accounting_reader;

-- Create backup user
CREATE ROLE accounting_backup WITH LOGIN PASSWORD 'backup_password';
GRANT CONNECT ON DATABASE accounting_db TO accounting_backup;
GRANT USAGE ON SCHEMA public TO accounting_backup;

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit.log_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit.audit_log (
            table_name,
            operation,
            old_values,
            new_values,
            user_id,
            timestamp
        ) VALUES (
            TG_TABLE_NAME,
            TG_OP,
            row_to_json(OLD),
            NULL,
            current_setting('accounting.user_id', true),
            NOW()
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit.audit_log (
            table_name,
            operation,
            old_values,
            new_values,
            user_id,
            timestamp
        ) VALUES (
            TG_TABLE_NAME,
            TG_OP,
            row_to_json(OLD),
            row_to_json(NEW),
            current_setting('accounting.user_id', true),
            NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit.audit_log (
            table_name,
            operation,
            old_values,
            new_values,
            user_id,
            timestamp
        ) VALUES (
            TG_TABLE_NAME,
            TG_OP,
            NULL,
            row_to_json(NEW),
            current_setting('accounting.user_id', true),
            NOW()
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit.audit_log (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit.audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit.audit_log(user_id);

-- Security settings
ALTER DATABASE accounting_db SET log_statement = 'all';
ALTER DATABASE accounting_db SET log_min_duration_statement = 1000;
ALTER DATABASE accounting_db SET log_connections = on;
ALTER DATABASE accounting_db SET log_disconnections = on;
ALTER DATABASE accounting_db SET log_lock_waits = on;

-- Performance settings
ALTER DATABASE accounting_db SET shared_preload_libraries = 'pg_stat_statements';
ALTER DATABASE accounting_db SET max_connections = 200;
ALTER DATABASE accounting_db SET effective_cache_size = '256MB';
ALTER DATABASE accounting_db SET maintenance_work_mem = '64MB';
ALTER DATABASE accounting_db SET checkpoint_completion_target = 0.9;
ALTER DATABASE accounting_db SET wal_buffers = '16MB';
ALTER DATABASE accounting_db SET default_statistics_target = 100;