-- FDT Database Schema
-- This script creates all necessary tables for the FDT application

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    balance DECIMAL(15, 2) DEFAULT 10000.00,
    daily_limit DECIMAL(15, 2) DEFAULT 10000.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    fingerprint_enabled BOOLEAN DEFAULT FALSE
);

-- User devices table
CREATE TABLE IF NOT EXISTS user_devices (
    device_id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(user_id) ON DELETE CASCADE,
    device_name VARCHAR(255),
    device_type VARCHAR(50),
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_trusted BOOLEAN DEFAULT FALSE
);

-- WebAuthn credentials table for biometric authentication
CREATE TABLE IF NOT EXISTS user_credentials (
    credential_id TEXT PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(user_id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    device_id VARCHAR(100),
    credential_name VARCHAR(255),
    aaguid TEXT,
    transports TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Transactions table (enhanced for Send Money)
CREATE TABLE IF NOT EXISTS transactions (
    tx_id VARCHAR(12) PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(user_id),
    device_id VARCHAR(100),
    ts TIMESTAMP NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    recipient_vpa VARCHAR(255) NOT NULL,
    tx_type VARCHAR(10) DEFAULT 'P2P',
    channel VARCHAR(20) DEFAULT 'app',
    risk_score DECIMAL(5, 4),
    action VARCHAR(20) DEFAULT 'ALLOW',
    db_status VARCHAR(20) DEFAULT 'pending',
    remarks TEXT,
    location VARCHAR(255),
    receiver_user_id VARCHAR(100) REFERENCES users(user_id),  -- Links to receiving user (null if unknown UPI)
    status_history TEXT[] DEFAULT '{}',  -- Array of status transitions with timestamps
    amount_deducted_at TIMESTAMP,  -- When debit happened
    amount_credited_at TIMESTAMP,  -- When credit happened (only if ALLOW/confirmed DELAY)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fraud alerts table
CREATE TABLE IF NOT EXISTS fraud_alerts (
    alert_id SERIAL PRIMARY KEY,
    tx_id VARCHAR(100) REFERENCES transactions(tx_id),
    user_id VARCHAR(100) REFERENCES users(user_id),
    alert_type VARCHAR(50),
    risk_score DECIMAL(5, 4),
    reason TEXT,
    user_decision VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- User behavior profiles table
CREATE TABLE IF NOT EXISTS user_behavior (
    profile_id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(user_id),
    avg_transaction_amount DECIMAL(15, 2),
    transaction_count INTEGER DEFAULT 0,
    last_transaction_date TIMESTAMP,
    common_recipients TEXT[],
    common_transaction_times INTEGER[],
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Push notification tokens table
CREATE TABLE IF NOT EXISTS push_tokens (
    token_id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(user_id),
    fcm_token TEXT NOT NULL,
    device_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Transaction ledger table (audit trail for all balance operations)
CREATE TABLE IF NOT EXISTS transaction_ledger (
    ledger_id SERIAL PRIMARY KEY,
    tx_id VARCHAR(100) REFERENCES transactions(tx_id),
    operation VARCHAR(50) NOT NULL,  -- 'DEBIT', 'CREDIT', 'REFUND', 'HOLD'
    user_id VARCHAR(100) REFERENCES users(user_id),
    amount DECIMAL(15, 2) NOT NULL,
    operation_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User daily transactions table (for cumulative daily limit tracking)
CREATE TABLE IF NOT EXISTS user_daily_transactions (
    record_id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(user_id),
    transaction_date DATE NOT NULL,  -- For tracking daily limit resets
    total_amount DECIMAL(15, 2) DEFAULT 0.00,  -- Sum of all transactions on that date
    transaction_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, transaction_date)
);

-- Create indexes for performance
-- Composite index for user transaction queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver_user_id ON transactions(receiver_user_id);
-- Composite index for action filtering queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_action_created ON transactions(user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user_id ON fraud_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_tx_id ON fraud_alerts(tx_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_ledger_tx_id ON transaction_ledger(tx_id);
CREATE INDEX IF NOT EXISTS idx_transaction_ledger_user_id ON transaction_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_transactions_user_date ON user_daily_transactions(user_id, transaction_date);

-- Insert demo users for testing
-- Password for all users: password123
INSERT INTO users (user_id, name, phone, email, password_hash, balance, daily_limit) 
VALUES 
    ('user_001', 'Rajesh Kumar', '+919876543210', 'rajesh@example.com', '$2b$12$sC4pqNPR0pxSK8.6E4aire4FCKHbWK988MYFODhurkjGs35TPj8i.', 25000.00, 10000.00),
    ('user_002', 'Priya Sharma', '+919876543211', 'priya@example.com', '$2b$12$sC4pqNPR0pxSK8.6E4aire4FCKHbWK988MYFODhurkjGs35TPj8i.', 15000.00, 10000.00),
    ('user_003', 'Amit Patel', '+919876543212', 'amit@example.com', '$2b$12$sC4pqNPR0pxSK8.6E4aire4FCKHbWK988MYFODhurkjGs35TPj8i.', 30000.00, 10000.00),
    -- New test users for Send Money feature
    ('user_004', 'Abishek Kumar', '+919876543219', 'abishek@example.com', '$2b$12$sC4pqNPR0pxSK8.6E4aire4FCKHbWK988MYFODhurkjGs35TPj8i.', 20000.00, 10000.00),
    ('user_005', 'Jerold Smith', '+919876543218', 'jerold@example.com', '$2b$12$sC4pqNPR0pxSK8.6E4aire4FCKHbWK988MYFODhurkjGs35TPj8i.', 18000.00, 10000.00),
    ('user_006', 'Gowtham Kumar', '+919876543217', 'gowtham@example.com', '$2b$12$sC4pqNPR0pxSK8.6E4aire4FCKHbWK988MYFODhurkjGs35TPj8i.', 22000.00, 10000.00)
ON CONFLICT (user_id) DO NOTHING;

-- Insert demo devices
INSERT INTO user_devices (device_id, user_id, device_name, device_type, is_trusted) 
VALUES 
    ('device_001', 'user_001', 'Rajesh iPhone', 'iOS', TRUE),
    ('device_002', 'user_002', 'Priya Android', 'Android', TRUE),
    ('device_003', 'user_003', 'Amit Samsung', 'Android', TRUE),
    -- Devices for new test users
    ('device_004', 'user_004', 'Abishek Pixel', 'Android', TRUE),
    ('device_005', 'user_005', 'Jerold iPhone', 'iOS', TRUE),
    ('device_006', 'user_006', 'Gowtham Samsung', 'Android', TRUE)
ON CONFLICT (device_id) DO NOTHING;

    -- Admin Logs table for tracking admin actions across devices
    CREATE TABLE IF NOT EXISTS admin_logs (
        log_id SERIAL PRIMARY KEY,
        tx_id VARCHAR(100) NOT NULL,
        user_id VARCHAR(255),
        action VARCHAR(20) NOT NULL,
        admin_username VARCHAR(100),
        source_ip VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create index for admin logs queries
    CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_tx_id ON admin_logs(tx_id);
