#!/usr/bin/env python3
"""
FDT Database Migration Script - Add Send Money Feature Tables
This script adds the new tables and columns needed for the Send Money feature
to existing databases.
"""

import os
import psycopg2
import psycopg2.extras
from datetime import datetime

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

DB_URL = os.getenv("DB_URL", "postgresql://user:password@host:port/dbname").strip()

def run_migration():
    """Run the database migration for Send Money feature"""
    print("🔄 Starting FDT Send Money database migration...")
    
    conn = None
    try:
        conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        cur = conn.cursor()
        
        print("📊 Step 1: Adding new columns to transactions table...")
        
        # Add new columns to transactions table
        new_columns = [
            ("receiver_user_id", "VARCHAR(100) REFERENCES users(user_id)"),
            ("status_history", "TEXT[] DEFAULT '{}'"),
            ("amount_deducted_at", "TIMESTAMP"),
            ("amount_credited_at", "TIMESTAMP")
        ]
        
        for column_name, column_def in new_columns:
            try:
                cur.execute(f"ALTER TABLE transactions ADD COLUMN IF NOT EXISTS {column_name} {column_def}")
                print(f"  ✅ Added column: {column_name}")
            except Exception as e:
                print(f"  ⚠️  Column {column_name} already exists or error: {e}")
        
        print("📊 Step 2: Creating transaction_ledger table...")
        
        # Create transaction_ledger table
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
        print("  ✅ Created transaction_ledger table")
        
        print("📊 Step 3: Creating user_daily_transactions table...")
        
        # Create user_daily_transactions table
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
        print("  ✅ Created user_daily_transactions table")
        
        print("📊 Step 4: Creating indexes...")
        
        # Create indexes
        indexes = [
            ("idx_transactions_receiver_user_id", "transactions", "receiver_user_id"),
            ("idx_transaction_ledger_tx_id", "transaction_ledger", "tx_id"),
            ("idx_transaction_ledger_user_id", "transaction_ledger", "user_id"),
            ("idx_user_daily_transactions_user_date", "user_daily_transactions", "user_id, transaction_date")
        ]
        
        for index_name, table_name, columns in indexes:
            try:
                cur.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({columns})")
                print(f"  ✅ Created index: {index_name}")
            except Exception as e:
                print(f"  ⚠️  Index {index_name} already exists or error: {e}")
        
        print("📊 Step 5: Adding new test users...")
        
        # Add new test users
        new_users = [
            ('user_004', 'Abishek Kumar', '+919876543219', 'abishek@example.com', 
             '$2b$12$sC4pqNPR0pxSK8.6E4aire4FCKHbWK988MYFODhurkjGs35TPj8i.', 20000.00, 10000.00),
            ('user_005', 'Jerold Smith', '+919876543218', 'jerold@example.com', 
             '$2b$12$sC4pqNPR0pxSK8.6E4aire4FCKHbWK988MYFODhurkjGs35TPj8i.', 18000.00, 10000.00),
            ('user_006', 'Gowtham Kumar', '+919876543217', 'gowtham@example.com', 
             '$2b$12$sC4pqNPR0pxSK8.6E4aire4FCKHbWK988MYFODhurkjGs35TPj8i.', 22000.00, 10000.00)
        ]
        
        for user_data in new_users:
            try:
                cur.execute("""
                    INSERT INTO users (user_id, name, phone, email, password_hash, balance, daily_limit)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id) DO NOTHING
                """, user_data)
                print(f"  ✅ Added user: {user_data[1]}")
            except Exception as e:
                print(f"  ⚠️  User {user_data[1]} already exists or error: {e}")
        
        print("📊 Step 6: Adding devices for new users...")
        
        # Add devices for new users
        new_devices = [
            ('device_004', 'user_004', 'Abishek Pixel', 'Android', TRUE),
            ('device_005', 'user_005', 'Jerold iPhone', 'iOS', TRUE),
            ('device_006', 'user_006', 'Gowtham Samsung', 'Android', TRUE)
        ]
        
        for device_data in new_devices:
            try:
                cur.execute("""
                    INSERT INTO user_devices (device_id, user_id, device_name, device_type, is_trusted)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (device_id) DO NOTHING
                """, device_data)
                print(f"  ✅ Added device: {device_data[2]}")
            except Exception as e:
                print(f"  ⚠️  Device {device_data[2]} already exists or error: {e}")
        
        # Commit all changes
        conn.commit()
        
        print("🎉 Migration completed successfully!")
        print("\n📋 Summary of changes:")
        print("  ✅ Added 4 new columns to transactions table")
        print("  ✅ Created transaction_ledger table (audit trail)")
        print("  ✅ Created user_daily_transactions table (daily limit tracking)")
        print("  ✅ Created 4 new indexes for performance")
        print("  ✅ Added 3 new test users (Abishek, Jerold, Gowtham)")
        print("  ✅ Added 3 new devices for test users")
        
        print("\n🧪 Testing database connection...")
        cur.execute("SELECT COUNT(*) as user_count FROM users")
        user_count = cur.fetchone()['user_count']
        print(f"  📊 Total users in database: {user_count}")
        
        cur.execute("SELECT COUNT(*) as ledger_count FROM transaction_ledger")
        ledger_count = cur.fetchone()['ledger_count']
        print(f"  📊 Transaction ledger entries: {ledger_count}")
        
        print("\n✅ Database is ready for Send Money feature!")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()