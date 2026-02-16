# test_db_conn.py
import yaml, psycopg2, sys, os
from pathlib import Path
print("cwd:", os.getcwd())
config_path = Path(__file__).parent.parent / "config" / "config.yaml"
raw = open(str(config_path), "rb").read()
print("raw head bytes:", raw[:8])
text = raw.decode("utf-8")
print("raw (first 200 chars):")
print(text[:200])
cfg = yaml.safe_load(text)
print("loaded cfg keys:", list((cfg or {}).keys()))
db = cfg.get("db_url")
print("db_url repr:", repr(db))
try:
    conn = psycopg2.connect(db)
    cur = conn.cursor()
    cur.execute("SELECT 1;")
    print("DB CONNECT OK:", cur.fetchone())
    cur.close()
    conn.close()
except Exception as e:
    print("CONNECT ERROR:", e)
    sys.exit(1)