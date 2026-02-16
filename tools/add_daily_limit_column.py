#!/usr/bin/env python3
"""
Add daily_limit column to users table if it doesn't exist
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DB_URL", "postgresql://user:password@host:port/dbname").strip()

def add_daily_limit_column():
    """Add daily_limit column to users table"""
    conn = psycopg2.connect(DB_URL)
    try:
        cur = conn.cursor()
        
        # Add column if it doesn't exist
        cur.execute(
            """
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS daily_limit DECIMAL(15, 2) DEFAULT 10000.00
            """
        )
        
        conn.commit()
        print("✓ daily_limit column added successfully")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    add_daily_limit_column()
