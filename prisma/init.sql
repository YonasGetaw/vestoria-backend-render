-- Initialize database for Vestoria
-- This file is executed when the PostgreSQL container starts for the first time

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set timezone
SET timezone = 'UTC';
