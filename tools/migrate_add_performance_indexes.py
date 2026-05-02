#!/usr/bin/env python3
"""
Migration script to add performance indexes for faster transaction queries.
This script adds composite indexes that significantly improve query performance.
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DB_URL = os.getenv("DB_URL", "").strip()

def main():
    print("🔧 Adding performance indexes for transactions...")
    
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        # Add composite indexes for better query performance
        indexes = [
            ("idx_transactions_user_created", 
             "CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC)"),
            
            ("idx_transactions_user_action_created", 
             "CREATE INDEX IF NOT EXISTS idx_transactions_user_action_created ON transactions(user_id, action, created_at DESC)")
        ]
        
        for idx_name, sql in indexes:
            print(f"  Creating index: {idx_name}...")
            cur.execute(sql)
            print(f"  ✓ {idx_name} created")
        
        conn.commit()
        print("\n✅ Performance indexes added successfully!")
        print("\nIndexes created:")
        print("  - idx_transactions_user_created (user_id, created_at DESC)")
        print("  - idx_transactions_user_action_created (user_id, action, created_at DESC)")
        print("\nThese indexes will significantly speed up transaction history queries.")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
