# scripts/check_schema.py
import yaml, psycopg2, pathlib, sys

# load config (simple UTF-8 try; if fails use previous loader)
text = pathlib.Path("config.yaml").read_text(encoding="utf-8")
cfg = yaml.safe_load(text)
db = cfg.get("db_url") or cfg.get("db_url".lower()) or cfg.get("db")  # defensive

if not db:
    print("db_url not found in config.yaml. Keys:", cfg.keys())
    sys.exit(1)

print("Using DB URL:", db)

conn = psycopg2.connect(db)
cur = conn.cursor()

# list columns in transactions
cur.execute("""
 SELECT column_name, data_type
 FROM information_schema.columns
 WHERE table_name = 'transactions'
 ORDER BY ordinal_position;
""")
cols = cur.fetchall()
print("transactions table columns:")
for c in cols:
    print(" ", c)

# If action column missing, add it (text) and default 'ALLOW' so dashboard queries work
col_names = [c[0] for c in cols]
if 'action' not in col_names:
    print("Adding missing column 'action' (text) with default 'ALLOW'...")
    cur.execute("ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS action text DEFAULT 'ALLOW';")
    conn.commit()
    print("Added 'action' column.")

cur.close()
conn.close()
print("Done.")