"""
Test script to verify explainability is being stored and retrieved correctly.
Run this to debug explainability issues.
"""
import os
import sys
from dotenv import load_dotenv
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_URL = os.getenv("DB_URL") or "postgresql://fdt:fdtpass@127.0.0.1:5433/fdt_db"

def test_explainability_column():
    """Check if explainability column exists."""
    import psycopg2
    conn = psycopg2.connect(DB_URL)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'transactions'
            ORDER BY ordinal_position;
        """)
        columns = cur.fetchall()
        
        print("\n=== TRANSACTIONS TABLE COLUMNS ===")
        for col_name, col_type in columns:
            print(f"  {col_name:<20} {col_type}")
        
        has_expl = any(col[0] == 'explainability' for col in columns)
        if has_expl:
            print("\n✓ explainability column EXISTS")
        else:
            print("\n✗ explainability column MISSING")
            print("\nRun migration to add it:")
            print("  python tools/migrate_add_explainability.py")
            print("  or")
            print("  psql $DB_URL -f tools/migrate_add_explainability.sql")
        
        cur.close()
        return has_expl
    finally:
        conn.close()

def test_recent_transaction_explainability():
    """Check if recent transactions have explainability data."""
    import psycopg2
    import psycopg2.extras
    
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur = conn.cursor()
        
        # Try to get explainability column
        try:
            cur.execute("""
                SELECT tx_id, action, risk_score, explainability
                FROM public.transactions
                ORDER BY created_at DESC
                LIMIT 5;
            """)
            rows = cur.fetchall()
            
            print("\n=== RECENT TRANSACTIONS (with explainability) ===")
            for row in rows:
                print(f"\nTX: {row['tx_id']}")
                print(f"  Action: {row['action']}")
                print(f"  Risk: {row.get('risk_score', 'N/A')}")
                expl = row.get('explainability')
                if expl:
                    print(f"  Explainability: {type(expl).__name__}")
                    if isinstance(expl, dict):
                        print(f"    - Reasons: {len(expl.get('reasons', []))} items")
                        print(f"    - Model scores: {list(expl.get('model_scores', {}).keys())}")
                        if expl.get('reasons'):
                            print(f"    - First reason: {expl['reasons'][0]}")
                    else:
                        print(f"    - Raw: {expl}")
                else:
                    print("  Explainability: NULL/missing")
                    
        except Exception as e:
            print(f"\n✗ Error querying explainability: {e}")
            print("\nThe explainability column may not exist yet.")
        
        cur.close()
    finally:
        conn.close()

def test_scoring_output():
    """Test that scoring produces explainability data."""
    print("\n=== TESTING SCORING OUTPUT ===")
    
    try:
        from app.scoring import score_transaction
        
        # Sample transaction
        test_tx = {
            "tx_id": "test_expl_" + str(os.urandom(4).hex()),
            "user_id": "user_test_123",
            "amount": 15000,
            "recipient_vpa": "merchant@upi",
            "tx_type": "P2M",
            "channel": "app",
            "timestamp": "2026-01-20T10:30:00Z"
        }
        
        print("\nTest transaction:", test_tx['tx_id'])
        
        # Score with details
        result = score_transaction(test_tx, return_details=True)
        
        print(f"\nScoring result type: {type(result).__name__}")
        if isinstance(result, dict):
            print(f"  risk_score: {result.get('risk_score')}")
            print(f"  reasons: {len(result.get('reasons', []))} items")
            print(f"  model_scores: {list(result.get('model_scores', {}).keys())}")
            
            if result.get('reasons'):
                print("\n  First 3 reasons:")
                for r in result.get('reasons', [])[:3]:
                    print(f"    - {r}")
            
            if result.get('model_scores'):
                print("\n  Model scores:")
                for k, v in result.get('model_scores', {}).items():
                    print(f"    - {k}: {v:.4f}" if v is not None else f"    - {k}: None")
        else:
            print(f"  ✗ Expected dict, got {type(result).__name__}: {result}")
            
    except Exception as e:
        print(f"\n✗ Error testing scoring: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("="*60)
    print("EXPLAINABILITY DIAGNOSTIC TOOL")
    print("="*60)
    
    # Test 1: Check column exists
    has_column = test_explainability_column()
    
    # Test 2: Check recent transactions
    if has_column:
        test_recent_transaction_explainability()
    
    # Test 3: Test scoring output
    test_scoring_output()
    
    print("\n" + "="*60)
    print("DIAGNOSTIC COMPLETE")
    print("="*60)
    print("\nIf explainability is empty:")
    print("1. Run migration: python tools/migrate_add_explainability.py")
    print("2. Submit new transactions (old ones won't have explainability)")
    print("3. Check browser console for 'showExplain' logs")
    print("="*60)
