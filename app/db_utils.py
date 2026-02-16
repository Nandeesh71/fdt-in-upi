# app/db_utils.py
import os
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone, timedelta

# read DB URL from env or config file path; keep same default as main
DB_URL = os.environ.get("DB_URL") or "postgresql://fdt:fdtpass@host.docker.internal:5432/fdt_db"

def _get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def count_recent_transactions_for_user_device(user_id=None, device_id=None, period_seconds=60):
    """
    Return count of transactions for user_id or device_id in the last `period_seconds`.
    """
    if not user_id and not device_id:
        return 0
    conn = _get_conn()
    try:
        cur = conn.cursor()
        q = "SELECT COUNT(*) as cnt FROM public.transactions WHERE created_at >= (now() - interval '%s seconds')"
        params = [period_seconds]
        if user_id:
            q += " AND user_id = %s"
            params.append(user_id)
        if device_id:
            q += " AND device_id = %s"
            params.append(device_id)
        cur.execute(q, tuple(params))
        r = cur.fetchone()
        return int(r["cnt"] or 0)
    finally:
        conn.close()