# simulator/generator.py
import requests, random, time
from datetime import datetime, timezone
import yaml
import sys
import os
import psycopg2
import psycopg2.extras
import threading
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add project root to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

URL = "http://localhost:8000/transactions"
DB_URL = os.getenv("DB_URL", "postgresql://fdt:fdtpass@localhost:5432/fdt_db")

# Load thresholds from config
try:
    with open("config.yaml", "r") as f:
        config = yaml.safe_load(f)
        DELAY_THRESHOLD = config.get("thresholds", {}).get("delay", 0.30)
        BLOCK_THRESHOLD = config.get("thresholds", {}).get("block", 0.60)
except:
    DELAY_THRESHOLD = 0.30
    BLOCK_THRESHOLD = 0.60

# Existing users from database (must match foreign key constraints)
EXISTING_USERS = [
    "user_001", "user_002", "user_003", "user_004", "user_005", "user_006",
    "user_7803cf39", "user_06a81a26", "user_28b04e92", "user_bcaa9d94", "user_6030fe90"
]

# Thread-safe sequence counter
_sequence_lock = threading.Lock()
_current_sequence = None
_last_date = None

def get_db_connection():
    """Create and return a database connection"""
    return psycopg2.connect(DB_URL)

def get_next_sequence():
    """Get the next transaction sequence number from database"""
    global _current_sequence, _last_date
    
    today = datetime.now(timezone.utc).strftime("%y%m%d")
    
    with _sequence_lock:
        # Reset if it's a new day or first run
        if _last_date != today or _current_sequence is None:
            _last_date = today
            
            try:
                conn = get_db_connection()
                cur = conn.cursor()
                
                # Get max sequence for today
                cur.execute(
                    """
                    SELECT COALESCE(MAX(CAST(SUBSTRING(tx_id FROM 7 FOR 6) AS INTEGER)), 0) as max_seq
                    FROM transactions 
                    WHERE tx_id LIKE %s
                    """,
                    (f"{today}%",)
                )
                result = cur.fetchone()
                max_seq = result[0] if result else 0
                
                cur.close()
                conn.close()
                
                _current_sequence = max_seq
                print(f"📊 Starting from sequence: {_current_sequence} for date {today}")
                
            except Exception as e:
                print(f"⚠️  Failed to get sequence from DB: {e}")
                _current_sequence = 0
        
        # Increment and return
        _current_sequence += 1
        return _current_sequence

def generate_tx_id():
    """Generate a unique transaction ID"""
    date_component = datetime.now(timezone.utc).strftime("%y%m%d")
    sequence = get_next_sequence()
    return f"{date_component}{sequence:06d}"

def gen_tx():
    ts = datetime.now(timezone.utc).isoformat()

    # Generate diverse transaction patterns
    pattern = random.choices(
        ["normal", "suspicious", "high_risk", "burst"],
        weights=[60, 20, 10, 10]
    )[0]

    if pattern == "normal":
        # Regular small-medium transactions
        amount = round(abs(random.gauss(500, 300)) + 50, 2)
        user_id = random.choice(EXISTING_USERS)
        device_id = f"device{random.randint(1,150)}"
        channel = random.choice(["app", "app", "app", "qr"])
        is_new_device = False

    elif pattern == "suspicious":
        # Larger amounts, new recipients, unusual channels
        amount = round(abs(random.gauss(3000, 1500)) + 1000, 2)
        user_id = random.choice(EXISTING_USERS)
        device_id = f"device{random.randint(150,300)}"  # New devices
        channel = random.choice(["web", "qr", "qr"])
        is_new_device = True  # Likely new device

    elif pattern == "high_risk":
        # Very large amounts, night time simulation
        amount = round(abs(random.gauss(8000, 3000)) + 5000, 2)
        user_id = random.choice(EXISTING_USERS[-3:])  # Fewer unique users
        device_id = f"device_{random.randint(1000, 9999)}_{random.randint(1000, 9999)}"  # Always new device
        channel = random.choice(["web", "web", "qr"])
        is_new_device = True  # Always new

    else:  # burst
        # Multiple rapid transactions (velocity risk)
        amount = round(abs(random.gauss(1500, 800)) + 200, 2)
        user_id = random.choice(EXISTING_USERS[:3])  # Same users repeatedly
        device_id = f"device{random.randint(1,10)}"
        channel = random.choice(["app", "qr", "web"])
        is_new_device = False

    # Determine transaction type and recipient
    tx_type = random.choice(["P2P", "P2M", "P2M"])  # 33% P2P, 67% P2M
    if tx_type == "P2P":
        recipient_vpa = f"user{random.randint(1,250)}@upi"  # Person-to-Person
        is_new_recipient = random.random() < 0.3  # 30% new recipients
    else:
        recipient_vpa = f"merchant{random.randint(1,80)}@upi"  # Person-to-Merchant
        is_new_recipient = random.random() < 0.4  # 40% new merchants

    return {
        "tx_id": generate_tx_id(),
        "user_id": user_id,
        "device_id": device_id,
        "ts": ts,
        "amount": amount,
        "recipient_vpa": recipient_vpa,
        "tx_type": tx_type,
        "channel": channel,
        "_simulated": True,  # Mark as simulated transaction
        # Metadata for display (not sent to API)
        "_pattern": pattern,
        "_is_new_device": is_new_device,
        "_is_new_recipient": is_new_recipient
        # Let the API keep risk at 0 for simulated transactions
    }

if __name__ == "__main__":
    print("=" * 80)
    print("🚀 UPI Fraud Detection Simulator Started")
    print(f"📡 Posting to: {URL}")
    print(f"⚙️  Thresholds: DELAY={DELAY_THRESHOLD}, BLOCK={BLOCK_THRESHOLD}")
    print("=" * 80)
    
    while True:
        tx = gen_tx()
        
        # Extract metadata for display
        pattern = tx.pop("_pattern")
        is_new_device = tx.pop("_is_new_device")
        is_new_recipient = tx.pop("_is_new_recipient")
        
        try:
            r = requests.post(URL, json=tx, timeout=5)
            response = r.json() if r.status_code == 200 else {"error": r.text}

            # Extract response data
            inserted = response.get("inserted", {}) if isinstance(response.get("inserted"), dict) else {}
            risk_score = inserted.get("risk_score", 0) if isinstance(inserted, dict) else 0
            action = inserted.get("action", "UNKNOWN") if isinstance(inserted, dict) else "UNKNOWN"
            
            # Color codes for actions
            if action == "ALLOW":
                action_icon = "🟢"
            elif action == "DELAY":
                action_icon = "🟡"
            elif action == "BLOCK":
                action_icon = "🔴"
            else:
                action_icon = "❓"
            
            # Pattern display
            pattern_display = {
                "normal": "✅ Normal",
                "suspicious": "⚠️  Suspicious",
                "high_risk": "🚨 High Risk",
                "burst": "⚡ Burst"
            }
            
            # Print formatted output
            print(f"\n{'─' * 80}")
            print(f"Pattern:    {pattern_display.get(pattern, pattern)}")
            print(f"TX ID:      {tx['tx_id']}")
            print(f"User:       {tx['user_id']:<15} Device: {tx['device_id'][:20]} {'🆕 NEW' if is_new_device else '✓ Known'}")
            print(f"Amount:     ₹{tx['amount']:<10.2f} Type: {tx['tx_type']:<5} Channel: {tx['channel']}")
            print(f"Recipient:  {tx['recipient_vpa']:<30} {'🆕 NEW' if is_new_recipient else '✓ Known'}")
            print(f"Risk Score: {risk_score:.4f}")
            print(f"Action:     {action_icon} {action}")
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
        
        time.sleep(0.2)
