"""
Migration: add explainability JSONB column to public.transactions.
Safe to run multiple times (IF NOT EXISTS).
"""
import psycopg2
import os

from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DB_URL") or "postgresql://fdt:fdtpass@127.0.0.1:5433/fdt_db"

DDL = """
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS explainability JSONB;
"""

def run():
    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(DDL)
            conn.commit()
            print("✓ explainability column ensured (JSONB)")
    finally:
        conn.close()

if __name__ == "__main__":
    run()
