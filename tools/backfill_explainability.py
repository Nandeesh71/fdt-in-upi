"""
Backfill script: Generate explainability data for all existing transactions.
This script processes all transactions without explainability data and generates
fraud detection reasons and model scores for them.
"""
import psycopg2
import psycopg2.extras
import json
import os
import sys
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

load_dotenv()

DB_URL = os.getenv("DB_URL") or "postgresql://fdt:fdtpass@127.0.0.1:5432/fdt_db"


def load_scoring_module():
    """Load scoring module with error handling."""
    try:
        from app import scoring
        return scoring
    except ImportError:
        import scoring
        return scoring


def generate_explainability_for_transaction(tx_dict, scoring_module):
    """
    Generate explainability data for a transaction using the scoring module.
    
    Args:
        tx_dict: Transaction dictionary with tx_id, risk_score, features, etc.
        scoring_module: Loaded scoring module
    
    Returns:
        dict: Explainability data with reasons, model_scores, etc.
    """
    try:
        # Re-score the transaction to get all details
        scoring_details = scoring_module.score_transaction(tx_dict, return_details=True)
        
        if not scoring_details:
            return None
        
        risk_score = scoring_details.get("risk_score")
        confidence_level = scoring_details.get("confidence_level", "HIGH")
        disagreement = scoring_details.get("disagreement", 0.0)
        final_risk_score = scoring_details.get("final_risk_score")
        
        # Generate pattern analysis using the mapper
        pattern_summary = None
        pattern_reasons = []
        try:
            from app.pattern_mapper import PatternMapper
            pattern_summary = PatternMapper.get_pattern_summary(
                scoring_details.get("features", {}),
                scoring_details.get("model_scores", {})
            )
            # Align explainability reasons with fraud pattern categories
            for p in pattern_summary.get("detected_patterns", []):
                name = p.get("name") or "Pattern"
                expl = p.get("explanation") or "Detected"
                pattern_reasons.append(f"{name}: {expl}")
        except Exception as e:
            print(f"  [WARN] Pattern mapping error: {e}")
        
        # Merge base reasons with pattern-driven reasons
        merged_reasons = []
        for reason in list(scoring_details.get("reasons", [])) + pattern_reasons:
            if reason and reason not in merged_reasons:
                merged_reasons.append(reason)
        
        explainability = {
            "reasons": merged_reasons,
            "pattern_reasons": pattern_reasons,
            "model_scores": scoring_details.get("model_scores", {}),
            "features": scoring_details.get("features", {}),
            "patterns": pattern_summary,
            "confidence_level": confidence_level,
            "disagreement": disagreement,
            "final_risk_score": final_risk_score if final_risk_score is not None else risk_score,
        }
        
        return explainability
    except Exception as e:
        print(f"  [ERROR] Failed to generate explainability: {e}")
        return None


def backfill_explainability():
    """Main backfill function."""
    conn = psycopg2.connect(DB_URL)
    try:
        cur = conn.cursor()
        
        # Get all transactions without explainability data
        cur.execute("""
            SELECT tx_id, user_id, device_id, ts, amount, recipient_vpa, 
                   tx_type, channel, risk_score, action, db_status, 
                   location, receiver_user_id
            FROM public.transactions
            WHERE explainability IS NULL
            ORDER BY created_at DESC
        """)
        
        rows = cur.fetchall()
        print(f"Found {len(rows)} transactions without explainability data")
        
        if not rows:
            print("✓ All transactions already have explainability data")
            return
        
        # Load scoring module
        try:
            scoring = load_scoring_module()
            print("✓ Scoring module loaded successfully")
        except Exception as e:
            print(f"✗ Failed to load scoring module: {e}")
            return
        
        # Get column names
        col_names = [desc[0] for desc in cur.description]
        
        # Process each transaction
        updated_count = 0
        skipped_count = 0
        
        for idx, row in enumerate(rows, 1):
            tx_dict = dict(zip(col_names, row))
            tx_id = tx_dict.get("tx_id")
            
            print(f"\n[{idx}/{len(rows)}] Processing {tx_id}...", end=" ")
            
            # Generate explainability data
            explainability = generate_explainability_for_transaction(tx_dict, scoring)
            
            if not explainability:
                print("SKIPPED")
                skipped_count += 1
                continue
            
            # Update transaction with explainability data
            try:
                explainability_json = psycopg2.extras.Json(explainability)
                cur.execute("""
                    UPDATE public.transactions
                    SET explainability = %s,
                        updated_at = NOW()
                    WHERE tx_id = %s
                """, (explainability_json, tx_id))
                conn.commit()
                updated_count += 1
                print("UPDATED")
                
                # Show sample reasons
                reasons = explainability.get("reasons", [])
                if reasons:
                    print(f"  - Reasons: {reasons[0]}")
                model_scores = explainability.get("model_scores", {})
                if model_scores:
                    risk_score = explainability.get("final_risk_score", 0)
                    print(f"  - Final Risk Score: {risk_score:.4f}")
            except Exception as e:
                print(f"FAILED: {e}")
                conn.rollback()
                skipped_count += 1
        
        # Final summary
        print(f"\n{'='*60}")
        print(f"Backfill Summary:")
        print(f"  Total transactions processed: {len(rows)}")
        print(f"  Successfully updated: {updated_count}")
        print(f"  Skipped/Failed: {skipped_count}")
        print(f"{'='*60}")
        
        if updated_count > 0:
            print("✓ Explainability data backfill completed successfully")
        
    finally:
        conn.close()


if __name__ == "__main__":
    print("Starting explainability backfill...")
    backfill_explainability()
