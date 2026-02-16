"""Verify pattern mapper integration by checking persisted data."""
import psycopg2
import psycopg2.extras
import os
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DB_URL") or "postgresql://fdt:fdtpass@127.0.0.1:5433/fdt_db"

conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

cur.execute("""
    SELECT tx_id, action, risk_score, explainability
    FROM public.transactions
    WHERE explainability IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 3
""")

rows = cur.fetchall()

print("\n" + "="*80)
print("PATTERN MAPPER INTEGRATION VERIFICATION")
print("="*80)

for i, row in enumerate(rows, 1):
    print(f"\n{i}. Transaction: {row['tx_id']}")
    print(f"   Action: {row['action']} | Risk: {row.get('risk_score', 0):.4f}")
    
    expl = row.get('explainability')
    if expl:
        # Check if patterns are present
        patterns = expl.get('patterns')
        if patterns:
            print(f"   ✓ Pattern analysis PRESENT")
            counts = patterns.get('pattern_counts', {})
            detected = patterns.get('detected_patterns', [])
            
            print(f"   Total patterns detected: {patterns.get('total_detected', 0)}")
            print(f"   Pattern counts:")
            for pattern, count in counts.items():
                if count > 0:
                    print(f"     - {pattern}: {count}")
            
            if detected:
                print(f"   Detected patterns:")
                for p in detected:
                    print(f"     • {p['name']} (confidence: {p['confidence']:.2f})")
                    print(f"       {p['explanation']}")
        else:
            print(f"   ✗ Pattern analysis MISSING")
        
        # Check features
        features = expl.get('features')
        if features:
            print(f"   ✓ Features present: {len(features)} keys")
        else:
            print(f"   ✗ Features missing")
        
        # Check model scores
        model_scores = expl.get('model_scores')
        if model_scores:
            print(f"   ✓ Model scores: {list(model_scores.keys())}")
        else:
            print(f"   ✗ Model scores missing")
    else:
        print("   ✗ No explainability data")

cur.close()
conn.close()

print("\n" + "="*80)
print("VERIFICATION COMPLETE")
print("="*80)
