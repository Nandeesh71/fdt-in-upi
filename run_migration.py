#!/usr/bin/env python
"""Run database migration to add explainability column"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# Database connection
DEFAULT_DB_URL = "postgresql://fdt:fdtpass@host.docker.internal:5432/fdt_db"
DB_URL = os.getenv("DB_URL", DEFAULT_DB_URL)

print(f"Connecting to database: {DB_URL[:50]}...")

try:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    print("✓ Connected to database")
    
    # Read and execute migration
    migration_sql = """
    ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS explainability JSONB;
    """
    
    print("Executing migration: Adding explainability column...")
    cur.execute(migration_sql)
    conn.commit()
    
    print("✅ Migration successful!")
    print("✓ Column 'explainability' added to transactions table")
    
except Exception as e:
    print(f"❌ Migration failed: {e}")
    conn.rollback()
finally:
    conn.close()
