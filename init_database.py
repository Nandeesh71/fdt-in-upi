#!/usr/bin/env python
"""Initialize database schema"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DB_URL")

if not DB_URL:
    print("❌ Error: DB_URL environment variable not set!")
    print("Set it with: set DB_URL=postgresql://...")
    exit(1)

print(f"Connecting to database: {DB_URL[:50]}...")

try:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    print("✓ Connected to database")
    
    # Create users table
    print("Creating users table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id VARCHAR(100) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(20) UNIQUE NOT NULL,
            email VARCHAR(255),
            password_hash TEXT NOT NULL,
            balance DECIMAL(15, 2) DEFAULT 10000.00,
            is_active BOOLEAN DEFAULT TRUE,
            fingerprint_enabled BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create transactions table
    print("Creating transactions table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            tx_id VARCHAR(100) PRIMARY KEY,
            user_id VARCHAR(100) REFERENCES users(user_id),
            device_id VARCHAR(100),
            ts TIMESTAMP NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            recipient_vpa VARCHAR(255) NOT NULL,
            tx_type VARCHAR(50),
            channel VARCHAR(50),
            risk_score DECIMAL(5, 4) DEFAULT 0.0,
            action VARCHAR(50),
            db_status VARCHAR(50) DEFAULT 'pending',
            remarks TEXT,
            receiver_user_id VARCHAR(100) REFERENCES users(user_id),
            status_history TEXT[] DEFAULT '{}',
            amount_deducted_at TIMESTAMP,
            amount_credited_at TIMESTAMP,
            explainability JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create fraud_alerts table
    print("Creating fraud_alerts table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fraud_alerts (
            alert_id SERIAL PRIMARY KEY,
            tx_id VARCHAR(100) REFERENCES transactions(tx_id),
            user_id VARCHAR(100) REFERENCES users(user_id),
            alert_type VARCHAR(50),
            risk_score DECIMAL(5, 4),
            reason TEXT,
            user_decision VARCHAR(50),
            resolved_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create user_credentials table
    print("Creating user_credentials table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_credentials (
            credential_id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(100) REFERENCES users(user_id),
            public_key TEXT NOT NULL,
            device_name VARCHAR(255),
            transports TEXT[],
            counter INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create push_tokens table
    print("Creating push_tokens table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS push_tokens (
            token_id SERIAL PRIMARY KEY,
            user_id VARCHAR(100) REFERENCES users(user_id),
            fcm_token TEXT NOT NULL,
            device_id VARCHAR(100),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create transaction_ledger table
    print("Creating transaction_ledger table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transaction_ledger (
            ledger_id SERIAL PRIMARY KEY,
            tx_id VARCHAR(100) REFERENCES transactions(tx_id),
            operation VARCHAR(50) NOT NULL,
            user_id VARCHAR(100) REFERENCES users(user_id),
            amount DECIMAL(15, 2) NOT NULL,
            operation_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            remarks TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create user_daily_transactions table
    print("Creating user_daily_transactions table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_daily_transactions (
            record_id SERIAL PRIMARY KEY,
            user_id VARCHAR(100) REFERENCES users(user_id),
            transaction_date DATE NOT NULL,
            total_amount DECIMAL(15, 2) DEFAULT 0.00,
            transaction_count INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, transaction_date)
        )
    """)
    
    # Create indexes
    print("Creating indexes...")
    indexes = [
        ("idx_users_phone", "users", "phone"),
        ("idx_users_user_id", "users", "user_id"),
        ("idx_transactions_user_id", "transactions", "user_id"),
        ("idx_transactions_tx_id", "transactions", "tx_id"),
        ("idx_transactions_created_at", "transactions", "created_at"),
        ("idx_transactions_receiver_user_id", "transactions", "receiver_user_id"),
        ("idx_transaction_ledger_tx_id", "transaction_ledger", "tx_id"),
        ("idx_transaction_ledger_user_id", "transaction_ledger", "user_id"),
        ("idx_user_daily_transactions_user_date", "user_daily_transactions", "user_id, transaction_date")
    ]
    
    for index_name, table_name, columns in indexes:
        cur.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns})")
    
    conn.commit()
    print("✅ Database initialized successfully!")
    
except Exception as e:
    print(f"❌ Initialization failed: {e}")
    conn.rollback()
finally:
    conn.close()