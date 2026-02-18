-- Migration: Create biometric authentication tables
-- Date: 2026-02-19
-- Description: Create user_credentials and biometric_sessions tables for WebAuthn support

-- Ensure users table has biometric_enabled flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_biometric_registration TIMESTAMP;

-- Create user_credentials table for storing WebAuthn credentials
CREATE TABLE IF NOT EXISTS user_credentials (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    sign_count BIGINT DEFAULT 0,
    transports TEXT, -- JSON array of transports: ["usb", "ble", "nfc", "internal"]
    device_name TEXT,
    device_fingerprint TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    -- Add indexes for fast lookups
    CONSTRAINT fk_user_credentials_user_id FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_credential_id ON user_credentials(credential_id);

-- Create biometric_sessions table for trusted device tracking
CREATE TABLE IF NOT EXISTS biometric_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    device_fingerprint TEXT NOT NULL,
    device_name TEXT,
    trusted_until TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Add index for fast lookups
    CONSTRAINT fk_biometric_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_biometric_sessions_user_id ON biometric_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_sessions_session_id ON biometric_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_biometric_sessions_trusted_until ON biometric_sessions(trusted_until);

-- Create biometric_challenges table for challenge storage (alternative to Redis)
CREATE TABLE IF NOT EXISTS biometric_challenges (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(user_id) ON DELETE CASCADE,
    challenge_id VARCHAR(255) UNIQUE NOT NULL,
    challenge TEXT NOT NULL,
    challenge_type VARCHAR(50) NOT NULL, -- 'registration' or 'authentication'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    -- Add index for cleanup
    CONSTRAINT fk_biometric_challenges_user_id FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_biometric_challenges_user_id ON biometric_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_challenges_expires_at ON biometric_challenges(expires_at);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_user_credentials_updated_at ON user_credentials;
CREATE TRIGGER trg_update_user_credentials_updated_at
BEFORE UPDATE ON user_credentials
FOR EACH ROW
EXECUTE FUNCTION update_user_credentials_updated_at();
