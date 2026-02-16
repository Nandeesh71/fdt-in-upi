"""
INTEGRATION GUIDE: Fraud Reasons Module

This file demonstrates how to integrate the fraud_reasons module
into your existing FastAPI scoring pipeline.
"""

# ============================================================================
# EXAMPLE 1: Basic Integration with Scoring Pipeline
# ============================================================================

def example_1_basic_integration():
    """
    Simple integration: Extract -> Score -> Generate Reasons
    """
    from app.scoring import extract_features, score_with_ensemble
    from app.fraud_reasons import generate_fraud_reasons, categorize_fraud_risk
    
    # Transaction data
    tx = {
        "user_id": "user123",
        "device_id": "device456",
        "amount": 25000,
        "timestamp": "2024-01-20T02:30:00Z",
        "recipient_vpa": "unknown@upi",
        "tx_type": "P2P",
        "channel": "app"
    }
    
    # Step 1: Extract features
    features = extract_features(tx)
    
    # Step 2: Score with ML models
    scores = score_with_ensemble(features)
    
    # Step 3: Generate human-readable reasons
    reasons, composite_score = generate_fraud_reasons(
        features=features,
        scores=scores
    )
    
    # Step 4: Categorize risk
    categorization = categorize_fraud_risk(
        ensemble_score=scores["ensemble"],
        fraud_reasons=reasons
    )
    
    # Step 5: Use results
    print(f"Risk Level: {categorization['risk_level']}")
    print(f"Action: {categorization['action']}")
    print(f"Score: {categorization['score']:.2%}")
    print(f"Reasons: {len(reasons)} detected")
    
    return categorization


# ============================================================================
# EXAMPLE 2: FastAPI Integration
# ============================================================================

def example_2_fastapi_integration():
    """
    Complete FastAPI endpoint with fraud reasoning
    """
    from fastapi import FastAPI
    from app.scoring import extract_features, score_with_ensemble
    from app.fraud_reasons import generate_fraud_reasons, categorize_fraud_risk
    
    app = FastAPI()
    
    @app.post("/api/score-transaction")
    async def score_transaction(transaction: dict):
        """
        Score a transaction and return fraud reasoning
        """
        try:
            # Extract features
            features = extract_features(transaction)
            
            # Score with models
            scores = score_with_ensemble(features)
            
            # Generate reasons
            reasons, _ = generate_fraud_reasons(features, scores)
            
            # Categorize
            categorization = categorize_fraud_risk(
                scores["ensemble"],
                reasons
            )
            
            # Format response
            return {
                "status": "success",
                "transaction_id": transaction.get("id"),
                "risk_level": categorization["risk_level"],
                "action": categorization["action"],
                "score": round(categorization["score"], 4),
                "explanation": categorization["explanation"],
                "reasons": [r.to_dict() for r in reasons],
                "critical_count": len(categorization["critical_reasons"]),
                "high_count": len(categorization["high_reasons"])
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }
    
    return app


# ============================================================================
# EXAMPLE 3: Logging & Audit Trail
# ============================================================================

def example_3_logging_with_audit():
    """
    Generate comprehensive audit logs with fraud reasons
    """
    from app.scoring import extract_features, score_with_ensemble
    from app.fraud_reasons import (
        generate_fraud_reasons,
        categorize_fraud_risk,
        format_fraud_reasons_text
    )
    from datetime import datetime
    import json
    
    def log_fraud_decision(tx, features, scores, reasons, categorization):
        """Log transaction with full audit trail"""
        
        audit_log = {
            "timestamp": datetime.utcnow().isoformat(),
            "transaction": {
                "id": tx.get("id"),
                "amount": tx.get("amount"),
                "user_id": tx.get("user_id"),
                "device_id": tx.get("device_id"),
                "recipient": tx.get("recipient_vpa")
            },
            "scoring": {
                "iforest_score": scores.get("iforest"),
                "random_forest_score": scores.get("random_forest"),
                "xgboost_score": scores.get("xgboost"),
                "ensemble_score": scores.get("ensemble")
            },
            "decision": {
                "risk_level": categorization["risk_level"],
                "action": categorization["action"],
                "composite_score": categorization["score"]
            },
            "reasons": [r.to_dict() for r in reasons],
            "key_features": {
                "amount": features.get("amount"),
                "is_new_device": features.get("is_new_device"),
                "is_new_recipient": features.get("is_new_recipient"),
                "tx_count_1h": features.get("tx_count_1h"),
                "is_night": features.get("is_night")
            }
        }
        
        # Log to file
        with open("fraud_decisions.log", "a") as f:
            f.write(json.dumps(audit_log) + "\n")
        
        print(f"✓ Logged: {categorization['risk_level']} - {tx.get('id')}")
        return audit_log
    
    return log_fraud_decision


# ============================================================================
# EXAMPLE 4: Batch Processing with Reasons
# ============================================================================

def example_4_batch_processing():
    """
    Process multiple transactions and generate summary report
    """
    from app.scoring import extract_features, score_with_ensemble
    from app.fraud_reasons import generate_fraud_reasons, categorize_fraud_risk
    
    transactions = [
        {"id": "tx1", "amount": 5000, "user_id": "u1"},
        {"id": "tx2", "amount": 50000, "user_id": "u2"},
        {"id": "tx3", "amount": 1000, "user_id": "u3"},
    ]
    
    results = {
        "BLOCKED": [],
        "DELAYED": [],
        "APPROVED": []
    }
    
    for tx in transactions:
        features = extract_features(tx)
        scores = score_with_ensemble(features)
        reasons, _ = generate_fraud_reasons(features, scores)
        categorization = categorize_fraud_risk(scores["ensemble"], reasons)
        
        # Categorize result
        level = categorization["risk_level"]
        results[level].append({
            "tx_id": tx["id"],
            "reasons": [r.to_dict() for r in reasons],
            "score": categorization["score"]
        })
    
    # Print summary
    print("\n=== BATCH PROCESSING SUMMARY ===")
    for level, transactions in results.items():
        print(f"{level}: {len(transactions)} transactions")
    
    return results


# ============================================================================
# EXAMPLE 5: Reason-Based Decision Rules
# ============================================================================

def example_5_conditional_logic():
    """
    Use fraud reasons to make conditional business decisions
    """
    from app.fraud_reasons import FraudReason
    
    def should_send_otp(reasons):
        """Send OTP if medium-severity reasons detected"""
        return any(r.severity in ["high", "critical"] for r in reasons)
    
    def should_contact_user(reasons):
        """Contact user if multiple high-severity reasons"""
        high_reasons = [r for r in reasons if r.severity == "high"]
        return len(high_reasons) >= 2
    
    def should_auto_block(reasons):
        """Auto-block if critical reasons"""
        return any(r.severity == "critical" for r in reasons)
    
    def get_risk_summary(reasons):
        """Get brief summary of fraud risks"""
        by_severity = {
            "critical": [r.reason for r in reasons if r.severity == "critical"],
            "high": [r.reason for r in reasons if r.severity == "high"]
        }
        
        summary = []
        if by_severity["critical"]:
            summary.append(f"CRITICAL: {by_severity['critical'][0]}")
        if by_severity["high"]:
            summary.append(f"HIGH: {by_severity['high'][0]}")
        
        return " | ".join(summary) if summary else "Normal transaction"
    
    # Usage
    sample_reasons = [
        FraudReason("High amount", "high", "amount", 50000),
        FraudReason("New device", "high", "device", 1),
    ]
    
    print(f"Send OTP? {should_send_otp(sample_reasons)}")
    print(f"Contact User? {should_contact_user(sample_reasons)}")
    print(f"Auto Block? {should_auto_block(sample_reasons)}")
    print(f"Summary: {get_risk_summary(sample_reasons)}")


# ============================================================================
# EXAMPLE 6: Customizing Thresholds
# ============================================================================

def example_6_custom_thresholds():
    """
    Use custom thresholds for different scenarios
    """
    from app.fraud_reasons import generate_fraud_reasons, categorize_fraud_risk
    from app.scoring import extract_features, score_with_ensemble
    
    # Different threshold profiles
    profiles = {
        "strict": {"delay": 0.02, "block": 0.04},
        "balanced": {"delay": 0.03, "block": 0.06},
        "lenient": {"delay": 0.05, "block": 0.10}
    }
    
    # Sample transaction
    tx = {"id": "tx1", "amount": 15000}
    features = extract_features(tx)
    scores = score_with_ensemble(features)
    reasons, _ = generate_fraud_reasons(features, scores)
    
    print("\n=== THRESHOLD COMPARISON ===")
    print(f"Ensemble Score: {scores['ensemble']:.2%}\n")
    
    for profile_name, thresholds in profiles.items():
        categorization = categorize_fraud_risk(
            scores["ensemble"],
            reasons,
            thresholds=thresholds
        )
        print(f"{profile_name.upper():8} -> {categorization['risk_level']}")


# ============================================================================
# EXAMPLE 7: Reason Analytics & Monitoring
# ============================================================================

def example_7_analytics():
    """
    Track and analyze fraud reasons for monitoring
    """
    from collections import Counter
    from app.fraud_reasons import generate_fraud_reasons
    
    def analyze_reason_distribution(processed_transactions):
        """
        Analyze which fraud reasons are most common
        """
        all_reasons = []
        reason_severity = Counter()
        reason_types = Counter()
        
        for tx_result in processed_transactions:
            reasons = tx_result["reasons"]
            for reason in reasons:
                all_reasons.append(reason)
                reason_severity[reason.severity] += 1
                reason_types[reason.feature_name] += 1
        
        report = {
            "total_reasons": len(all_reasons),
            "by_severity": dict(reason_severity),
            "by_feature": dict(reason_types),
            "most_common": reason_types.most_common(5)
        }
        
        print("\n=== FRAUD REASON ANALYTICS ===")
        print(f"Total Reasons Detected: {report['total_reasons']}")
        print(f"By Severity: {report['by_severity']}")
        print(f"\nTop 5 Reason Features:")
        for feature, count in report["most_common"]:
            print(f"  {feature}: {count} occurrences")
        
        return report


# ============================================================================
# EXAMPLE 8: Performance Optimization
# ============================================================================

def example_8_caching_optimization():
    """
    Cache results for frequently checked transactions
    """
    from functools import lru_cache
    import hashlib
    
    @lru_cache(maxsize=1000)
    def cached_fraud_scoring(tx_hash):
        """Cache fraud reasons by transaction hash"""
        # In production, deserialize tx_hash and process
        pass
    
    def get_tx_hash(tx):
        """Generate cache key from transaction"""
        cache_key = f"{tx['user_id']}_{tx['amount']}_{tx['device_id']}"
        return hashlib.md5(cache_key.encode()).hexdigest()
    
    # Usage
    tx = {"user_id": "u1", "amount": 5000, "device_id": "d1"}
    cache_key = get_tx_hash(tx)
    print(f"Cache key: {cache_key}")


# ============================================================================
# MAIN: Run All Examples
# ============================================================================

if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("FRAUD REASONS MODULE - INTEGRATION EXAMPLES")
    print("=" * 70)
    
    # Note: Examples that require app imports commented out
    # Uncomment to run in actual environment
    
    # print("\n📌 EXAMPLE 1: Basic Integration")
    # example_1_basic_integration()
    
    # print("\n📌 EXAMPLE 3: Logging & Audit")
    # example_3_logging_with_audit()
    
    # print("\n📌 EXAMPLE 4: Batch Processing")
    # example_4_batch_processing()
    
    print("\n📌 EXAMPLE 5: Conditional Logic")
    example_5_conditional_logic()
    
    # print("\n📌 EXAMPLE 6: Custom Thresholds")
    # example_6_custom_thresholds()
    
    print("\n📌 EXAMPLE 8: Caching")
    example_8_caching_optimization()
    
    print("\n" + "=" * 70)
    print("See individual functions for implementation details")
    print("=" * 70)
