#!/usr/bin/env python3
"""
Quick DB check: loads config/config.yaml (or DB_URL env) and prints masked URL,
row count and 5 latest transactions. Run from workspace root:
  python tools\db_check.py
"""
import os
import yaml
import psycopg2
import psycopg2.extras

CFG = os.path.join(os.getcwd(), 'config', 'config.yaml')

def mask(url):
    try:
        if '//' not in url:
            return url
        pre, rest = url.split('//', 1)
        if '@' in rest:
            creds, hostpart = rest.split('@', 1)
            return f"{pre}//****@{hostpart}"
        return url
    except Exception:
        return url


def load_db_url():
    env = os.getenv('DB_URL')
    if env:
        return env
    if os.path.exists(CFG):
        with open(CFG, 'r', encoding='utf-8') as fh:
            cfg = yaml.safe_load(fh) or {}
            return cfg.get('db_url')
    return None


def main():
    db = load_db_url()
    print('Using DB URL:', mask(db) if db else 'None')
    if not db:
        print('No DB URL found in env or config/config.yaml')
        return
    try:
        conn = psycopg2.connect(db, cursor_factory=psycopg2.extras.RealDictCursor)
    except Exception as e:
        print('Failed to connect to DB:', e)
        return
    try:
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*) AS cnt FROM public.transactions;')
        row = cur.fetchone()
        cnt = row['cnt'] if row and 'cnt' in row else row[0] if row else None
        print('transactions count =', cnt)
        cur.execute('SELECT MAX(created_at) AS newest, MIN(created_at) AS oldest FROM public.transactions;')
        range_row = cur.fetchone() or {}
        newest = range_row.get('newest') if isinstance(range_row, dict) else (range_row[0] if range_row else None)
        oldest = range_row.get('oldest') if isinstance(range_row, dict) else (range_row[1] if range_row else None)
        print('created_at range: newest=', newest, ' oldest=', oldest)
        cur.execute("SELECT tx_id, ts, created_at, amount, action FROM public.transactions ORDER BY COALESCE(ts, created_at) DESC LIMIT 5;")
        sample = cur.fetchall()
        print('sample rows:')
        for r in sample:
            print(r)
        cur.close()
    except Exception as e:
        print('Query failed:', e)
    finally:
        try:
            conn.close()
        except Exception:
            pass

if __name__ == '__main__':
    main()
