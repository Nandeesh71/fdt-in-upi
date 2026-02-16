# migrate_add_action.py
import os, sys
try:
    import yaml
    import psycopg2
    from psycopg2 import sql
except Exception as e:
    print("Missing dependency:", e)
    print("Run: pip install pyyaml psycopg2-binary")
    raise

CONFIG_YAML = "config.yaml"
DEFAULT_THRESHOLDS = {"delay": 0.02, "block": 0.07}

def load_config():
    cfg = {}
    if os.path.exists(CONFIG_YAML):
        with open(CONFIG_YAML, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
    db_url = cfg.get("db_url") or os.environ.get("DATABASE_URL")
    thresholds = cfg.get("thresholds", DEFAULT_THRESHOLDS)
    # ensure floats
    thresholds["delay"] = float(thresholds.get("delay", DEFAULT_THRESHOLDS["delay"]))
    thresholds["block"] = float(thresholds.get("block", DEFAULT_THRESHOLDS["block"]))
    return db_url, thresholds

def run_migration(db_url, thresholds):
    if not db_url:
        print("No DB URL found. Set db_url in config.yaml or DATABASE_URL env var.")
        sys.exit(1)
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        cur.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS risk_score double precision;")
        cur.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS action text;")
        conn.commit()

        cur.execute("UPDATE transactions SET risk_score = 0.0 WHERE risk_score IS NULL;")
        conn.commit()

        delay = thresholds["delay"]
        block = thresholds["block"]

        cur.execute(sql.SQL("""
            UPDATE transactions
            SET action = CASE
                WHEN risk_score >= %s THEN 'BLOCK'
                WHEN risk_score >= %s THEN 'DELAY'
                ELSE 'ALLOW'
            END
            WHERE action IS NULL OR action = '';
        """), [block, delay])
        conn.commit()

        cur.execute("CREATE INDEX IF NOT EXISTS idx_transactions_action ON transactions (action);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_transactions_risk_score ON transactions (risk_score);")
        conn.commit()

        cur.execute("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE action='BLOCK') AS block, COUNT(*) FILTER (WHERE action='DELAY') AS delay, COUNT(*) FILTER (WHERE action='ALLOW') AS allow FROM transactions;")
        print("AGGREGATES:", cur.fetchone())

        cur.execute("SELECT id, tx_id, risk_score, action FROM transactions ORDER BY created_at DESC LIMIT 10;")
        rows = cur.fetchall()
        for r in rows:
            print(r)

        cur.close()
    finally:
        conn.close()

if __name__ == "__main__":
    db_url, thresholds = load_config()
    print("Using DB URL:", db_url)
    print("Thresholds:", thresholds)
    run_migration(db_url, thresholds)
