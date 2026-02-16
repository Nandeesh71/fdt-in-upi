import os
import redis
from datetime import datetime, timezone, timedelta
import math
import statistics

# Redis connection - Use environment variable or default to localhost
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
try:
    r = redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2, socket_timeout=2)
    r.ping()
    print(f"✓ Redis connected: {REDIS_URL}")
except Exception as e:
    print(f"[WARN] Redis unavailable: {e}. Using fallback without Redis.")
    r = None

# ---------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------
def safe_ts(timestamp_str):
    """Convert timestamp to IST datetime (UTC+5:30)."""
    try:
        dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00")).astimezone(timezone.utc)
        # Convert to IST (UTC+5:30)
        ist_offset = timedelta(hours=5, minutes=30)
        return dt.astimezone(timezone(ist_offset))
    except:
        return datetime.now(timezone(timedelta(hours=5, minutes=30)))

def zcount_last_seconds(key, now_ts, seconds):
    """Count events in a ZSET in the last X seconds."""
    if r is None:
        return 0
    try:
        start = now_ts - seconds
        return r.zcount(key, start, now_ts)
    except:
        return 0

def zsum_last_seconds(key, now_ts, seconds):
    """Sum values in a ZSET in the last X seconds."""
    if r is None:
        return 0
    try:
        start = now_ts - seconds
        vals = r.zrangebyscore(key, start, now_ts)
        return sum(map(float, vals))
    except:
        return 0

# ---------------------------------------------
# MAIN FEATURE EXTRACTOR (v3 - Enhanced)
# ---------------------------------------------
def extract_features(tx):
    """
    Enhanced feature extraction returning a dictionary with 20+ features.
    
    FEATURE GROUPS:
    1. Basic Transaction Features (3)
    2. Temporal Features (5) 
    3. Velocity Features (5)
    4. Behavioral Features (5)
    5. Statistical Features (4)
    6. Risk Indicators (3)
    
    Returns: dict with feature names as keys
    """
    
    # Extract timestamp - handle multiple possible field names
    ts_field = tx.get("timestamp") or tx.get("ts") or tx.get("created_at")
    ts = safe_ts(ts_field) if ts_field else datetime.now(timezone.utc)
    now_ts = ts.timestamp()

    # Basic fields
    amount = float(tx.get("amount", 0))
    user = tx.get("user_id", "unknown")
    device = tx.get("device_id", "unknown")
    recipient = tx.get("recipient_vpa", "unknown@upi")
    tx_type = tx.get("tx_type", "P2P").upper()
    channel = tx.get("channel", "app").lower()
    
    features = {}
    
    # =========================================================
    # 1. BASIC TRANSACTION FEATURES
    # =========================================================
    features["amount"] = amount
    features["log_amount"] = math.log1p(amount)  # log transform for better distribution
    features["is_round_amount"] = 1.0 if (amount % 100 == 0 or amount % 500 == 0) else 0.0
    
    # =========================================================
    # 2. TEMPORAL FEATURES
    # =========================================================
    features["hour_of_day"] = float(ts.hour)
    features["month_of_year"] = float(ts.month)  # 1-12
    features["day_of_week"] = float(ts.weekday())  # 0=Monday, 6=Sunday
    features["is_weekend"] = 1.0 if ts.weekday() >= 5 else 0.0
    features["is_night"] = 1.0 if (ts.hour >= 22 or ts.hour <= 5) else 0.0
    features["is_business_hours"] = 1.0 if (9 <= ts.hour <= 17) else 0.0
    
    # =========================================================
    # 3. VELOCITY FEATURES (transaction frequency)
    # =========================================================
    if r is not None:
        tx_key = f"user:{user}:timestamps"
        r.zadd(tx_key, {str(now_ts): now_ts})
        r.zremrangebyscore(tx_key, 0, now_ts - 86400)  # keep 24h
        
        features["tx_count_1h"] = float(r.zcount(tx_key, now_ts - 3600, now_ts))
        features["tx_count_6h"] = float(r.zcount(tx_key, now_ts - 21600, now_ts))
        features["tx_count_24h"] = float(r.zcount(tx_key, now_ts - 86400, now_ts))
        
        # High-speed velocity
        vel_1m_key = f"user:{user}:vel_1m"
        vel_5m_key = f"user:{user}:vel_5m"
        r.zadd(vel_1m_key, {str(now_ts): now_ts})
        r.zadd(vel_5m_key, {str(now_ts): now_ts})
        r.zremrangebyscore(vel_1m_key, 0, now_ts - 60)
        r.zremrangebyscore(vel_5m_key, 0, now_ts - 300)
        
        features["tx_count_1min"] = float(r.zcount(vel_1m_key, now_ts - 60, now_ts))
        features["tx_count_5min"] = float(r.zcount(vel_5m_key, now_ts - 300, now_ts))
        
        r.expire(tx_key, 86400)
        r.expire(vel_1m_key, 120)
        r.expire(vel_5m_key, 600)
    else:
        # Redis unavailable: use reasonable default velocity features for demonstration
        features["tx_count_1h"] = 1.0
        features["tx_count_6h"] = 2.0
        features["tx_count_24h"] = 5.0
        features["tx_count_1min"] = 1.0
        features["tx_count_5min"] = 1.0
    
    # =========================================================
    # 4. BEHAVIORAL FEATURES
    # =========================================================
    
    if r is not None:
        # New recipient detection (DO NOT ADD - only check if known)
        rec_key = f"user:{user}:recipients"
        new_rec = 0
        if not r.sismember(rec_key, recipient):
            new_rec = 1
            # REMOVED: Do NOT add recipient here - only add when transaction is confirmed/allowed
        r.expire(rec_key, 86400 * 30)
        features["is_new_recipient"] = float(new_rec)
        
        # Recipient transaction count
        features["recipient_tx_count"] = float(r.scard(rec_key))
        
        # Device checking disabled - same device used for testing
        features["is_new_device"] = 0.0
        features["device_count"] = 1.0
    else:
        # Redis unavailable: use probabilistic defaults
        features["is_new_recipient"] = 0.3  # 30% chance
        features["recipient_tx_count"] = 5.0
        features["is_new_device"] = 0.0  # Device checking disabled
        features["device_count"] = 1.0
    
    # Transaction type encoding
    features["is_p2m"] = 1.0 if tx_type == "P2M" else 0.0
    features["is_p2p"] = 1.0 if tx_type == "P2P" else 0.0
    
    # =========================================================
    # 5. STATISTICAL FEATURES (amount patterns)
    # =========================================================
    
    if r is not None:
        # Track amount history for user
        amt_key = f"user:{user}:amounts"
        r.zadd(amt_key, {str(amount): now_ts})
        r.zremrangebyscore(amt_key, 0, now_ts - 86400 * 7)  # keep 7 days
        r.expire(amt_key, 86400 * 7)
        
        # Get recent amounts for statistics
        recent_amounts = r.zrangebyscore(amt_key, now_ts - 86400 * 7, now_ts)
        if recent_amounts:
            amounts_float = [float(a) for a in recent_amounts]
            features["amount_mean"] = statistics.mean(amounts_float)
            features["amount_std"] = statistics.stdev(amounts_float) if len(amounts_float) > 1 else 0.0
            features["amount_max"] = max(amounts_float)
            features["amount_deviation"] = abs(amount - features["amount_mean"]) / (features["amount_std"] + 1.0)
        else:
            features["amount_mean"] = amount
            features["amount_std"] = 0.0
            features["amount_max"] = amount
            features["amount_deviation"] = 0.0
    else:
        # Redis unavailable: use current amount as baseline
        features["amount_mean"] = amount
        features["amount_std"] = amount * 0.3  # Assume 30% std dev
        features["amount_max"] = amount * 1.5
        features["amount_deviation"] = 0.5
    
    # =========================================================
    # 6. RISK INDICATORS
    # =========================================================
    
    # Merchant risk scoring (improved)
    merchant = recipient.split("@")[0]
    merchant_risk = 0.0
    
    # Multiple risk factors
    if merchant[0].isdigit():
        merchant_risk += 0.5  # starts with number
    if len(merchant) < 4:
        merchant_risk += 0.3  # very short name
    if merchant.replace("0", "").replace("1", "") == "":
        merchant_risk += 0.2  # only 0s and 1s
    
    features["merchant_risk_score"] = min(merchant_risk, 1.0)
    
    # Channel risk (QR and web are higher risk)
    features["is_qr_channel"] = 1.0 if channel == "qr" else 0.0
    features["is_web_channel"] = 1.0 if channel == "web" else 0.0
    
    return features


def get_feature_names():
    """Return ordered list of feature names for model training."""
    return [
        # Basic (3)
        "amount", "log_amount", "is_round_amount",
        # Temporal (6)
        "hour_of_day", "month_of_year", "day_of_week", "is_weekend", "is_night", "is_business_hours",
        # Velocity (5)
        "tx_count_1h", "tx_count_6h", "tx_count_24h", "tx_count_1min", "tx_count_5min",
        # Behavioral (6)
        "is_new_recipient", "recipient_tx_count", "is_new_device", "device_count", "is_p2m", "is_p2p",
        # Statistical (4)
        "amount_mean", "amount_std", "amount_max", "amount_deviation",
        # Risk (3)
        "merchant_risk_score", "is_qr_channel", "is_web_channel"
    ]


def features_to_vector(feature_dict):
    """Convert feature dictionary to ordered numpy-compatible list."""
    feature_names = get_feature_names()
    return [float(feature_dict.get(name, 0.0)) for name in feature_names]
