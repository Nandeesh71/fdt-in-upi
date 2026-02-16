# migrate_schema_and_backfill.py
import yaml
import psycopg2
import psycopg2.extras
import os
import sys
from datetime import datetime, timezone

# load config.yaml (supports either JSON or YAML structure)
import pathlib
CONF_PATH = pathlib.Path(__file__).parent.parent / "config" / "config.yaml"

def load_config(path=CONF_PATH):
    with open(str(path), "rb") as f:
        raw = f.read()
    # try text decode with utf-8, fallback to latin1
    try:
        text = raw.decode("utf-8")
    except Exception:
        text = raw.decode("latin1")
    data = yaml.safe_load(text)
    return data

def get_conn(db_url):
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)

def ensure_columns(conn):
    cur = conn.cursor()
    # Add columns only if they don't exist
    stmts = [
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS action TEXT;",
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS risk_score DOUBLE PRECISION;",
        # created_at with timezone
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();",
    ]
    for s in stmts:
        cur.execute(s)
    conn.commit()
    cur.close()
    print("[ok] ensured action, risk_score, created_at columns exist")

def import_scoring():
    # attempt to import user's scoring module in project root
    sys.path.insert(0, os.getcwd())
    try:
        import scoring
    except Exception as e:
        raise ImportError(f"Failed to import scoring.py: {e}") from e
    # required functions
    for fn in ("extract_features", "score_features", "assign_action"):
        if not hasattr(scoring, fn):
            raise ImportError(f"scoring.py missing required function: {fn}")
    return scoring

def backfill(conn, scoring_module, batch=200):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    # select rows missing risk_score or action
    cur.execute("""
      SELECT id, tx_id, user_id, device_id, ts, amount, recipient_vpa, tx_type, channel
      FROM transactions
      WHERE risk_score IS NULL OR action IS NULL
      ORDER BY created_at NULLS FIRST, id
      LIMIT %s;
    """, (batch,))
    rows = cur.fetchall()
    if not rows:
        print("[ok] no rows to backfill")
        cur.close()
        return 0

    updated = 0
    for r in rows:
        tx_data = {
            "tx_id": r.get("tx_id"),
            "user_id": r.get("user_id"),
            "device_id": r.get("device_id"),
            "timestamp": r.get("ts") or r.get("created_at"),
            "amount": float(r.get("amount")) if r.get("amount") is not None else 0.0,
            "recipient_vpa": r.get("recipient_vpa"),
            "tx_type": r.get("tx_type"),
            "channel": r.get("channel"),
        }
        try:
            feats = scoring_module.extract_features(tx_data)
            risk = scoring_module.score_features(feats)
            action = scoring_module.assign_action(risk)
        except Exception as e:
            print(f"[warn] scoring failed for tx_id={r.get('tx_id')} id={r.get('id')}: {e}")
            # fallback: mark risk 0 and ALLOW
            risk = 0.0
            action = "ALLOW"

        # update row
        cur2 = conn.cursor()
        cur2.execute("""
            UPDATE transactions
            SET risk_score = %s, action = %s, created_at = COALESCE(created_at, now())
            WHERE id = %s;
        """, (risk, action, r["id"]))
        conn.commit()
        cur2.close()
        updated += 1

    cur.close()
    print(f"[ok] backfilled {updated} rows (batch={batch})")
    return updated

def main():
    cfg = load_config(CONF_PATH)
    db_url = cfg.get("db_url") or cfg.get("DATABASE_URL") or cfg.get("DB_URL")
    if not db_url:
        print("ERROR: db_url not found in config.yaml")
        return

    print("Using DB URL:", db_url)
    conn = get_conn(db_url)

    try:
        ensure_columns(conn)
    except Exception as e:
        print("ERROR ensuring columns:", e)
        conn.close()
        return

    try:
        scoring = import_scoring()
    except Exception as e:
        print("ERROR importing scoring.py — backfill will be skipped. Details:")
        print(e)
        print("If scoring.py exists, ensure it is importable and defines extract_features, score_features, assign_action.")
        conn.close()
        return

    # Loop until no more rows to backfill (safe: limited batches)
    total_updated = 0
    while True:
        updated = backfill(conn, scoring, batch=200)
        total_updated += updated
        if updated == 0:
            break

    print(f"Done. Total rows backfilled: {total_updated}")
    conn.close()

if __name__ == "__main__":
    main()
