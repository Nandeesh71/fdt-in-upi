"""Check if recent transactions have explainability data."""
import psycopg2
import psycopg2.extras
import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DB_URL") or "postgresql://fdt:fdtpass@127.0.0.1:5433/fdt_db"

conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

cur.execute("""
    SELECT tx_id, action, risk_score, 
           explainability IS NOT NULL as has_expl,
           created_at,
           explainability
    FROM public.transactions 
    ORDER BY created_at DESC 
    LIMIT 10
""")

rows = cur.fetchall()

print("\n" + "="*80)
print("RECENT TRANSACTIONS - EXPLAINABILITY CHECK")
print("="*80)

for i, r in enumerate(rows, 1):
    print(f"\n{i}. TX: {r['tx_id']}")
    print(f"   Action: {r['action']:6} | Risk: {r.get('risk_score', 0):.4f}")
    print(f"   Created: {r['created_at']}")
    print(f"   Has explainability: {r['has_expl']}")
    
    if r['explainability']:
        expl = r['explainability']
        reasons = expl.get('reasons', [])
        model_scores = expl.get('model_scores', {})
        print(f"   Reasons count: {len(reasons)}")
        print(f"   Model scores: {list(model_scores.keys())}")
        if reasons:
            print(f"   First reason: {reasons[0]}")
    else:
        print("   ⚠️  No explainability data (old transaction)")

cur.close()
conn.close()

print("\n" + "="*80)
print("NOTE: Transactions created BEFORE the migration won't have explainability.")
print("Create NEW transactions to test explainability feature.")
print("="*80)
