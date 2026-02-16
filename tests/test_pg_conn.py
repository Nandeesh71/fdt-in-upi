import psycopg2
import sys

print("Testing connection with individual parameters...")

try:
    conn = psycopg2.connect(
        host="127.0.0.1",
        port=5432,
        database="fdt_db",
        user="fdt",
        password="fdtpass"
    )
    print("✓ Connection successful!")
    cur = conn.cursor()
    cur.execute("SELECT version();")
    version = cur.fetchone()
    print(f"PostgreSQL version: {version[0]}")
    cur.close()
    conn.close()
except Exception as e:
    print(f"✗ Connection failed: {e}")
    print(f"Error type: {type(e).__name__}")
    sys.exit(1)
