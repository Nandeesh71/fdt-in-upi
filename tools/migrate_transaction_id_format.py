"""
Migration script to update transaction IDs to 12-digit UPI format (YYMMDDXXXXXX).

This script:
1. Alters the tx_id column from VARCHAR(100) to VARCHAR(12)
2. Handles existing transactions with UUID-based IDs (converts to 12-digit format)
3. Updates all foreign key references to tx_id
4. Regenerates IDs for new transactions as needed

Run this after updating the codebase to use the new UPI transaction ID generator.
"""

import psycopg2
import psycopg2.extras
import os
import sys
from datetime import datetime, timezone
import pathlib

# Add project root to path
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from app.upi_transaction_id import generate_upi_transaction_id


def load_db_url():
    """Load database URL from environment or config file."""
    if "DB_URL" in os.environ:
        return os.environ["DB_URL"]
    
    config_path = pathlib.Path(__file__).parent.parent / "config" / "config.yaml"
    if config_path.exists():
        import yaml
        with open(str(config_path), "rb") as f:
            raw = f.read()
        try:
            text = raw.decode("utf-8")
        except Exception:
            text = raw.decode("latin1")
        config = yaml.safe_load(text)
        if config and "database" in config:
            return config["database"].get("url")
    
    raise ValueError("DB_URL not found in environment or config.yaml")


def get_conn(db_url):
    """Get database connection."""
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


def migrate_transaction_ids(db_url):
    """Migrate transaction IDs to 12-digit UPI format."""
    
    conn = get_conn(db_url)
    cur = conn.cursor()
    
    try:
        print("Starting transaction ID migration...")
        
        # Check current schema
        cur.execute("""
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'transactions' AND column_name = 'tx_id'
        """)
        col_info = cur.fetchone()
        
        if not col_info:
            print("✗ transactions table or tx_id column not found")
            return False
        
        print(f"Current tx_id column: {col_info['data_type']} ({col_info['character_maximum_length'] or 'unlimited'})")
        
        # If already VARCHAR(12), skip migration
        if col_info['character_maximum_length'] == 12:
            print("✓ tx_id column is already VARCHAR(12), skipping migration")
            conn.close()
            return True
        
        # Step 1: Create temporary table with new schema
        print("\n1. Creating temporary table with new schema...")
        cur.execute("""
            CREATE TABLE transactions_new (
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
                receiver_user_id VARCHAR(100) REFERENCES users(user_id),
                status_history TEXT[] DEFAULT '{}',
                amount_deducted_at TIMESTAMP,
                amount_credited_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                -- Store old ID for reference during migration
                old_tx_id VARCHAR(100)
            )
        """)
        conn.commit()
        print("✓ Temporary table created")
        
        # Step 2: Migrate data from old table
        print("\n2. Migrating transaction data...")
        cur.execute("""
            SELECT COUNT(*) as count FROM transactions
        """)
        total_count = cur.fetchone()['count']
        print(f"   Found {total_count} transactions to migrate")
        
        # Generate mapping of old IDs to new IDs
        cur.execute("SELECT tx_id FROM transactions ORDER BY created_at ASC")
        old_ids = [row['tx_id'] for row in cur.fetchall()]
        
        id_mapping = {}
        for old_id in old_ids:
            new_id = generate_upi_transaction_id()
            # Ensure uniqueness (extremely unlikely but possible if IDs collide)
            while new_id in id_mapping.values():
                new_id = generate_upi_transaction_id()
            id_mapping[old_id] = new_id
        
        print(f"✓ Generated {len(id_mapping)} new transaction IDs")
        
        # Step 3: Copy data with new IDs
        print("\n3. Copying data to temporary table...")
        for i, (old_id, new_id) in enumerate(id_mapping.items(), 1):
            if i % 1000 == 0:
                print(f"   Migrated {i}/{len(id_mapping)} transactions")
            
            cur.execute("""
                INSERT INTO transactions_new (
                    tx_id, user_id, device_id, ts, amount, recipient_vpa,
                    tx_type, channel, risk_score, action, db_status, remarks,
                    location, receiver_user_id, status_history, amount_deducted_at,
                    amount_credited_at, created_at, updated_at, old_tx_id
                )
                SELECT 
                    %s, user_id, device_id, ts, amount, recipient_vpa,
                    tx_type, channel, risk_score, action, db_status, remarks,
                    location, receiver_user_id, status_history, amount_deducted_at,
                    amount_credited_at, created_at, updated_at, tx_id
                FROM transactions
                WHERE tx_id = %s
            """, (new_id, old_id))
        
        conn.commit()
        print(f"✓ Copied {len(id_mapping)} transactions")
        
        # Step 4: Update foreign key references in related tables
        print("\n4. Updating foreign key references...")
        
        # Update fraud_alerts table
        cur.execute("SELECT COUNT(*) as count FROM fraud_alerts")
        alert_count = cur.fetchone()['count']
        if alert_count > 0:
            print(f"   Updating {alert_count} fraud alerts...")
            cur.execute("""
                UPDATE fraud_alerts fa
                SET tx_id = tn.tx_id
                FROM transactions_new tn
                WHERE fa.tx_id = tn.old_tx_id
            """)
            conn.commit()
            print("   ✓ Updated fraud_alerts")
        
        # Update transaction_ledger table
        cur.execute("SELECT COUNT(*) as count FROM transaction_ledger")
        ledger_count = cur.fetchone()['count']
        if ledger_count > 0:
            print(f"   Updating {ledger_count} transaction ledger entries...")
            cur.execute("""
                UPDATE transaction_ledger tl
                SET tx_id = tn.tx_id
                FROM transactions_new tn
                WHERE tl.tx_id = tn.old_tx_id
            """)
            conn.commit()
            print("   ✓ Updated transaction_ledger")
        
        # Update admin_logs table
        cur.execute("SELECT COUNT(*) as count FROM admin_logs")
        log_count = cur.fetchone()['count']
        if log_count > 0:
            print(f"   Updating {log_count} admin logs...")
            cur.execute("""
                UPDATE admin_logs al
                SET tx_id = tn.tx_id
                FROM transactions_new tn
                WHERE al.tx_id = tn.old_tx_id
            """)
            conn.commit()
            print("   ✓ Updated admin_logs")
        
        # Step 5: Drop old table and rename new table
        print("\n5. Finalizing schema update...")
        cur.execute("DROP TABLE transactions CASCADE")
        cur.execute("ALTER TABLE transactions_new RENAME TO transactions")
        cur.execute("ALTER TABLE transactions DROP COLUMN old_tx_id")
        conn.commit()
        print("✓ Schema updated")
        
        # Step 6: Recreate indexes
        print("\n6. Recreating indexes...")
        indexes = [
            "CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC)",
            "CREATE INDEX idx_transactions_user_id ON transactions(user_id)",
            "CREATE INDEX idx_transactions_created_at ON transactions(created_at)",
            "CREATE INDEX idx_transactions_receiver_user_id ON transactions(receiver_user_id)",
            "CREATE INDEX idx_transactions_user_action_created ON transactions(user_id, action, created_at DESC)",
            "CREATE INDEX idx_fraud_alerts_tx_id ON fraud_alerts(tx_id)",
            "CREATE INDEX idx_transaction_ledger_tx_id ON transaction_ledger(tx_id)",
            "CREATE INDEX idx_admin_logs_tx_id ON admin_logs(tx_id)",
        ]
        for idx_sql in indexes:
            cur.execute(idx_sql)
        conn.commit()
        print("✓ Indexes recreated")
        
        print("\n✅ Transaction ID migration completed successfully!")
        print(f"   Migrated {len(id_mapping)} transactions")
        print("   IDs are now in 12-digit UPI format: YYMMDDXXXXXX")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    try:
        db_url = load_db_url()
        print(f"Connecting to database: {db_url.split('@')[1] if '@' in db_url else 'localhost'}")
        
        success = migrate_transaction_ids(db_url)
        sys.exit(0 if success else 1)
        
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)
