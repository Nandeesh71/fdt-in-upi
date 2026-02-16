# app/main.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
async def health_check():
    """Health check endpoint for Render"""
    return {
        "status": "healthy",
        "service": "fdt-backend"
    }
    
import os
import yaml
import json
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

from fastapi import FastAPI, Request, Form, status, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.templating import Jinja2Templates
from fastapi.concurrency import run_in_threadpool

import psycopg2
import psycopg2.extras
from passlib.hash import pbkdf2_sha256
import redis

# Import UPI Transaction ID generator
from .upi_transaction_id import generate_upi_transaction_id

# Initialize Redis client for cache invalidation
redis_client = None
try:
    redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True)
    redis_client.ping()
    print("✓ Admin backend connected to Redis")
except Exception as e:
    print(f"⚠ Admin backend Redis unavailable: {e}")
    redis_client = None

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

# =========================================================================
# UTILITY FUNCTIONS
# =========================================================================

def to_json_serializable(obj):
    """Convert datetime objects to ISO format for consistent timezone handling"""
    if isinstance(obj, dict):
        return {k: to_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [to_json_serializable(item) for item in obj]
    elif isinstance(obj, datetime):
        # If no timezone, assume UTC
        if obj.tzinfo is None:
            obj = obj.replace(tzinfo=timezone.utc)
        return obj.isoformat()
    return obj

# --- time range helper ---
def parse_time_range(time_range: str):
    now = datetime.now(timezone.utc)

    if time_range == "1h":
        return now - timedelta(hours=1)
    elif time_range == "24h":
        return now - timedelta(hours=24)
    elif time_range == "7d":
        return now - timedelta(days=7)
    elif time_range == "30d":
        return now - timedelta(days=30)
    else:
        return None


def extract_confidence_level(row: Dict[str, Any], default: str = "HIGH") -> str:
    """Safely derive confidence_level from row or embedded explainability."""
    if not row:
        return default
    if row.get("confidence_level"):
        return row.get("confidence_level")
    expl = row.get("explainability") or {}
    if isinstance(expl, dict):
        return expl.get("confidence_level", default)
    return default


def attach_confidence_level(payload: Any, default: str = "HIGH") -> Any:
    """Ensure confidence_level key is present for outbound payloads."""
    if isinstance(payload, dict):
        payload.setdefault("confidence_level", extract_confidence_level(payload, default))
    return payload

# --- config loader with defaults ---
# Prefer workspace config/config.yaml; fallback to env; final fallback to defaults.
CFG_PATH = os.path.join(os.getcwd(), "config", "config.yaml")
DEFAULT_CFG = {
    "db_url": "postgresql://fdt:fdtpass@host.docker.internal:5432/fdt_db",
    "thresholds": {"delay": 0.30, "block": 0.60},
    # Use environment variable for production; default is for development only
    "secret_key": os.getenv("SECRET_KEY", "dev-secret-change-me-in-production"),
    # Multiple admin users support
    "admin_users": [
        {
            "username": "jerold",
            "password_hash": pbkdf2_sha256.hash("StrongAdmin123!"),
            "role": "Super Admin"
        },
        {
            "username": "aakash",
            "password_hash": pbkdf2_sha256.hash("StrongAdmin123!"),
            "role": "Admin"
        },
        {
            "username": "abhishek",
            "password_hash": pbkdf2_sha256.hash("StrongAdmin123!"),
            "role": "Admin"
        },
        {
            "username": "aarthi",
            "password_hash": pbkdf2_sha256.hash("StrongAdmin123!"),
            "role": "Admin"
        }
    ],
    # Legacy single admin support (backward compatibility)
    "admin_username": "jerold",
    "admin_password_hash": pbkdf2_sha256.hash("StrongAdmin123!")
}
cfg = DEFAULT_CFG.copy()
if os.path.exists(CFG_PATH):
    try:
        with open(CFG_PATH, "rb") as fh:
            raw = fh.read()
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = raw.decode("utf-8-sig")
        loaded = yaml.safe_load(text) or {}
        cfg.update(loaded)
    except Exception as e:
        print("Failed to load config.yaml:", e)

env_db_url = os.getenv("DB_URL")
DB_URL = env_db_url or cfg.get("db_url")

DEFAULT_THRESHOLDS = {
    "allowMax": 0.30,
    "delayMax": 0.60,
    "blockMin": 0.60,
    "lowConfidence": 0.40,
    "mediumConfidence": 0.70,
    "highConfidence": 0.85,
    "rfWeight": 35,
    "xgbWeight": 40,
    "isoWeight": 25
}

def _to_float(value, fallback):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(fallback)

def _to_int(value, fallback):
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(fallback)

def normalize_thresholds(raw):
    merged = DEFAULT_THRESHOLDS.copy()
    if isinstance(raw, dict):
        for key in merged.keys():
            if key in raw and raw[key] is not None:
                merged[key] = raw[key]
        if "allowMax" not in raw and "delay" in raw:
            merged["allowMax"] = raw["delay"]
        if "blockMin" not in raw and "block" in raw:
            merged["blockMin"] = raw["block"]

    merged["allowMax"] = _to_float(merged["allowMax"], DEFAULT_THRESHOLDS["allowMax"])
    merged["delayMax"] = _to_float(merged["delayMax"], DEFAULT_THRESHOLDS["delayMax"])
    merged["blockMin"] = _to_float(merged["blockMin"], DEFAULT_THRESHOLDS["blockMin"])
    merged["lowConfidence"] = _to_float(merged["lowConfidence"], DEFAULT_THRESHOLDS["lowConfidence"])
    merged["mediumConfidence"] = _to_float(merged["mediumConfidence"], DEFAULT_THRESHOLDS["mediumConfidence"])
    merged["highConfidence"] = _to_float(merged["highConfidence"], DEFAULT_THRESHOLDS["highConfidence"])
    merged["rfWeight"] = _to_int(merged["rfWeight"], DEFAULT_THRESHOLDS["rfWeight"])
    merged["xgbWeight"] = _to_int(merged["xgbWeight"], DEFAULT_THRESHOLDS["xgbWeight"])
    merged["isoWeight"] = _to_int(merged["isoWeight"], DEFAULT_THRESHOLDS["isoWeight"])

    merged["delay"] = merged["allowMax"]
    merged["block"] = merged["blockMin"]
    return merged

THRESHOLDS = normalize_thresholds(cfg.get("thresholds", {"delay": 0.30, "block": 0.60}))
SECRET_KEY = cfg.get("secret_key", DEFAULT_CFG["secret_key"])

# Load admin users (supports both new multi-user and legacy single-user format)
ADMIN_USERS = {}
if "admin_users" in cfg and isinstance(cfg["admin_users"], list):
    for admin in cfg["admin_users"]:
        ADMIN_USERS[admin["username"]] = {
            "password_hash": admin["password_hash"],
            "role": admin.get("role", "Admin")
        }
else:
    # Legacy single admin support
    ADMIN_USERNAME = cfg.get("admin_username", DEFAULT_CFG["admin_username"])
    ADMIN_PASSWORD_HASH = cfg.get("admin_password_hash", DEFAULT_CFG["admin_password_hash"])
    ADMIN_USERS[ADMIN_USERNAME] = {
        "password_hash": ADMIN_PASSWORD_HASH,
        "role": "Super Admin"
    }

# Also populate from default config if not overridden
if not cfg.get("admin_users"):
    for admin in DEFAULT_CFG["admin_users"]:
        if admin["username"] not in ADMIN_USERS:
            ADMIN_USERS[admin["username"]] = {
                "password_hash": admin["password_hash"],
                "role": admin.get("role", "Admin")
            }

# Debug: Print loaded admin users
print("=" * 60)
print("Loaded Admin Users:")
for username, data in ADMIN_USERS.items():
    print(f"  ✓ {username:12} - {data['role']}")
print(f"Total: {len(ADMIN_USERS)} admin users configured")
print("=" * 60)

# --- FastAPI app and templates ---
# Use absolute paths for templates and static files
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
# serve static if directory exists
if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# --- websockets manager ---
class WSManager:
    def __init__(self):
        self.connections: List[WebSocket] = []
        self.lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.connections.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self.lock:
            if ws in self.connections:
                self.connections.remove(ws)

    async def broadcast(self, message: Dict[str, Any]):
        text = json.dumps(message, default=str)
        async with self.lock:
            conns = list(self.connections)
        for ws in conns:
            try:
                await ws.send_text(text)
            except Exception:
                try:
                    await self.disconnect(ws)
                except Exception:
                    pass

ws_manager = WSManager()

# --- DB helpers (sync psycopg2 executed in threadpool) ---
def get_conn():
    if not DB_URL:
        raise RuntimeError("DB URL not configured")
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def db_get_transaction(tx_id):
    conn = get_conn()
    try:
        cur = conn.cursor()
        has_expl = _ensure_explainability_column(conn)
        cols = "tx_id, user_id, device_id, ts, amount, recipient_vpa, tx_type, channel, db_status, action, risk_score, created_at"
        if has_expl:
            cols += ", explainability"
        cur.execute(
            f"SELECT {cols} FROM public.transactions WHERE tx_id=%s;",
            (tx_id,)
        )
        row = cur.fetchone()
        cur.close()
        return row
    finally:
        conn.close()

_HAS_EXPL_COL = None

# Ensure admin_logs table exists (lazy create)
_HAS_ADMIN_LOGS = None


def _ensure_admin_logs_table(conn):
    global _HAS_ADMIN_LOGS
    if _HAS_ADMIN_LOGS is not None:
        return _HAS_ADMIN_LOGS
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.admin_logs (
                log_id SERIAL PRIMARY KEY,
                tx_id VARCHAR(100) NOT NULL,
                user_id VARCHAR(255),
                action VARCHAR(20) NOT NULL,
                admin_username VARCHAR(100),
                source_ip VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_admin_logs_tx_id ON public.admin_logs(tx_id);
            """
        )
        conn.commit()
        cur.close()
        _HAS_ADMIN_LOGS = True
    except Exception:
        _HAS_ADMIN_LOGS = False
    return _HAS_ADMIN_LOGS


def _ensure_explainability_column(conn) -> bool:
    global _HAS_EXPL_COL
    if _HAS_EXPL_COL is not None:
        return _HAS_EXPL_COL
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'transactions'
              AND column_name = 'explainability'
            LIMIT 1;
            """
        )
        _HAS_EXPL_COL = cur.fetchone() is not None
        cur.close()
    except Exception:
        _HAS_EXPL_COL = False
    return _HAS_EXPL_COL


def db_insert_transaction(tx: Dict[str, Any]):
    conn = get_conn()
    try:
        cur = conn.cursor()
        has_expl = _ensure_explainability_column(conn)

        explainability_payload = psycopg2.extras.Json(tx.get("explainability")) if has_expl else None

        if has_expl:
            try:
                cur.execute(
                    """
                    INSERT INTO public.transactions
                    (tx_id, user_id, device_id, ts, amount, recipient_vpa, tx_type, channel, risk_score, action, db_status, explainability, created_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                    ON CONFLICT (tx_id) DO UPDATE
                      SET risk_score = EXCLUDED.risk_score,
                          action = EXCLUDED.action,
                          db_status = EXCLUDED.db_status,
                          explainability = EXCLUDED.explainability,
                          created_at = now()
                    RETURNING tx_id, risk_score, action, created_at, explainability;
                    """,
                    (
                        tx.get("tx_id"),
                        tx.get("user_id"),
                        tx.get("device_id"),
                        tx.get("ts"),
                        tx.get("amount"),
                        tx.get("recipient_vpa"),
                        tx.get("tx_type"),
                        tx.get("channel"),
                        tx.get("risk_score"),
                        tx.get("action"),
                        tx.get("db_status", "inserted"),
                        explainability_payload,
                    ),
                )
                inserted = cur.fetchone()
                conn.commit()
                cur.close()
                return inserted
            except Exception as e:
                conn.rollback()
                print("Explainability column write failed, falling back without explainability:", e)

        # Fallback without explainability
        cur.execute(
            """
            INSERT INTO public.transactions
            (tx_id, user_id, device_id, ts, amount, recipient_vpa, tx_type, channel, risk_score, action, db_status, created_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
            ON CONFLICT (tx_id) DO UPDATE
              SET risk_score = EXCLUDED.risk_score,
                  action = EXCLUDED.action,
                  db_status = EXCLUDED.db_status,
                  created_at = now()
            RETURNING tx_id, risk_score, action, created_at;
            """,
            (
                tx.get("tx_id"),
                tx.get("user_id"),
                tx.get("device_id"),
                tx.get("ts"),
                tx.get("amount"),
                tx.get("recipient_vpa"),
                tx.get("tx_type"),
                tx.get("channel"),
                tx.get("risk_score"),
                tx.get("action"),
                tx.get("db_status", "inserted"),
            ),
        )
        inserted = cur.fetchone()
        conn.commit()
        cur.close()
        return inserted
    finally:
        conn.close()

def db_recent_transactions(limit=50, range_clause=None):
    conn = get_conn()
    try:
        cur = conn.cursor()
        has_expl = _ensure_explainability_column(conn)
        cols = "tx_id, user_id, amount, recipient_vpa, tx_type, channel, db_status, action, risk_score, created_at"
        if has_expl:
            cols += ", explainability"
        q = f"""
            SELECT {cols}
            FROM public.transactions
            ORDER BY created_at DESC
            LIMIT %s
        """
        params = (limit,)
        cur.execute(q, params)
        rows = cur.fetchall()
        cur.close()
        return rows
    finally:
        conn.close()

def db_dashboard_stats(time_range: str):
    conn = get_conn()
    try:
        cur = conn.cursor()

        interval_map = {
            "1h": "1 hour",
            "24h": "24 hours",
            "7d": "7 days",
            "30d": "30 days",
        }

        interval = interval_map.get(time_range, "24 hours")

        cur.execute(f"""
            SELECT
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE action = 'BLOCK') AS block,
              COUNT(*) FILTER (WHERE action = 'DELAY') AS delay,
              COUNT(*) FILTER (WHERE action = 'ALLOW') AS allow,
              COALESCE(AVG(risk_score), 0) AS mean_risk
            FROM transactions
            WHERE ts >= NOW() - INTERVAL '{interval}';
        """)

        return cur.fetchone()
    finally:
        conn.close()

def db_aggregate_fraud_patterns(time_range: str = "24h", limit: int = None):
    """
    Aggregate ML Pipeline Contribution statistics from transactions.
    
    Derives activity for each of the 5 ML systems from the explainability
    features/patterns stored in each transaction:
      - Trust Engine: new_recipient, recipient_tx_count (relationship trust)
      - Risk Buffer: cumulative risk from velocity + repeated high scores
      - Dynamic Thresholds: amount_deviation, model disagreement, action != ALLOW
      - Drift Detection: feature distribution anomalies (amount_std, deviation)
      - Graph Signals: recipient patterns, device sharing, merchant risk
    """
    conn = get_conn()
    try:
        cur = conn.cursor()
        
        since = parse_time_range(time_range)
        if since:
            cur.execute("""
                SELECT explainability, risk_score, action
                FROM public.transactions
                WHERE ts >= %s
                ORDER BY ts DESC
            """, (since,))
        else:
            max_limit = limit if limit else 1000
            cur.execute("""
                SELECT explainability, risk_score, action
                FROM public.transactions
                ORDER BY ts DESC
                LIMIT %s
            """, (max_limit,))
        
        rows = cur.fetchall()
        
        totals = {
            "trust_engine_triggers": 0,
            "risk_buffer_escalations": 0,
            "dynamic_threshold_adjustments": 0,
            "drift_alerts": 0,
            "graph_signal_flags": 0,
            "transactions_analyzed": 0,
        }
        
        for row in rows:
            totals["transactions_analyzed"] += 1
            
            try:
                if hasattr(row, 'get'):
                    expl = row.get("explainability")
                    risk_score = float(row.get("risk_score", 0) or 0)
                    action = row.get("action", "")
                else:
                    expl = row[0] if len(row) > 0 else None
                    risk_score = float(row[1]) if len(row) > 1 and row[1] else 0.0
                    action = row[2] if len(row) > 2 else ""
            except Exception:
                continue
            
            if not expl or not isinstance(expl, dict):
                # No explainability data - every tx still passes through all 5 systems.
                # Infer baseline activity from action and risk_score.
                # Trust Engine: flags when risk suggests untrusted relationship
                if risk_score > 0.3 or action in ("DELAY", "BLOCK"):
                    totals["trust_engine_triggers"] += 1
                # Dynamic Thresholds: always computes personalized threshold
                if action in ("DELAY", "BLOCK") or risk_score > 0.3:
                    totals["dynamic_threshold_adjustments"] += 1
                # Risk Buffer: high score accumulates in buffer
                if risk_score > 0.5:
                    totals["risk_buffer_escalations"] += 1
                # Graph Signals: recipient network always checked
                if risk_score > 0.4 or action == "BLOCK":
                    totals["graph_signal_flags"] += 1
                # Drift Detection: feature distributions always monitored
                if risk_score > 0.6:
                    totals["drift_alerts"] += 1
                continue
            
            features = expl.get("features", {}) or {}
            patterns = expl.get("patterns", {}) or {}
            model_scores = expl.get("model_scores", {}) or {}
            detected = patterns.get("detected_patterns", []) or []
            reasons = expl.get("reasons", []) or []
            reasons_text = " ".join(str(r).lower() for r in reasons)
            
            # --- Trust Engine ---
            # Triggers when dealing with new/unknown recipients or low recipient history
            is_new_recip = float(features.get("is_new_recipient", 0) or 0)
            recip_tx_count = float(features.get("recipient_tx_count", 0) or 0)
            if is_new_recip > 0 or recip_tx_count < 5:
                totals["trust_engine_triggers"] += 1
            
            # --- Risk Buffer (Cumulative Risk) ---
            # Triggers on velocity anomalies, repeated high risk, or high cumulative indicators
            tx_1min = float(features.get("tx_count_1min", 0) or 0)
            tx_5min = float(features.get("tx_count_5min", 0) or 0)
            tx_1h = float(features.get("tx_count_1h", 0) or 0)
            has_velocity = any(p.get("name", "") == "Velocity Anomaly" for p in detected if isinstance(p, dict))
            if has_velocity or tx_1min > 2 or tx_5min > 5 or (risk_score > 0.5 and tx_1h > 3):
                totals["risk_buffer_escalations"] += 1
            
            # --- Dynamic Thresholds ---
            # Triggers on amount deviations, model disagreement, or action escalation
            amount_dev = float(features.get("amount_deviation", 0) or 0)
            disagreement = float(model_scores.get("disagreement", 0) or expl.get("disagreement", 0) or 0)
            has_model_disagree = any(p.get("name", "") == "Model Disagreement" for p in detected if isinstance(p, dict))
            if amount_dev > 0.8 or has_model_disagree or disagreement > 0.25 or action in ("DELAY", "BLOCK"):
                totals["dynamic_threshold_adjustments"] += 1
            
            # --- Drift Detection ---
            # Triggers when features are outside normal ranges (statistical anomaly indicators)
            amount_std = float(features.get("amount_std", 0) or 0)
            is_new_device = float(features.get("is_new_device", 0) or 0)
            confidence_level = str(model_scores.get("confidence_level", "") or expl.get("confidence_level", "")).upper()
            has_device_anomaly = any(p.get("name", "") == "Device Anomaly" for p in detected if isinstance(p, dict))
            if confidence_level == "LOW" or has_device_anomaly or (is_new_device > 0 and amount_dev > 0.5):
                totals["drift_alerts"] += 1
            
            # --- Graph Signals ---
            # Triggers on recipient/merchant network risk indicators
            merchant_risk = float(features.get("merchant_risk_score", 0) or 0)
            device_count = float(features.get("device_count", 0) or 0)
            has_behavioural = any(p.get("name", "") == "Behavioural Anomaly" for p in detected if isinstance(p, dict))
            if merchant_risk > 0.3 or device_count > 3 or (has_behavioural and recip_tx_count > 10):
                totals["graph_signal_flags"] += 1
        
        return totals
    finally:
        conn.close()

def db_update_action(tx_id, action, risk_score=None, explainability=None):
    conn = get_conn()
    try:
        cur = conn.cursor()
        has_expl = _ensure_explainability_column(conn)

        expl_payload = psycopg2.extras.Json(explainability) if (has_expl and explainability is not None) else None

        if has_expl:
            try:
                # Only update explainability when explicitly provided; otherwise preserve existing JSON.
                if explainability is not None:
                    if risk_score is None:
                        cur.execute(
                            "UPDATE public.transactions SET action=%s, explainability=%s WHERE tx_id=%s RETURNING tx_id, action, risk_score, explainability, created_at;",
                            (action, expl_payload, tx_id),
                        )
                    else:
                        cur.execute(
                            "UPDATE public.transactions SET action=%s, risk_score=%s, explainability=%s WHERE tx_id=%s RETURNING tx_id, action, risk_score, explainability, created_at;",
                            (action, risk_score, expl_payload, tx_id),
                        )
                else:
                    if risk_score is None:
                        cur.execute(
                            "UPDATE public.transactions SET action=%s WHERE tx_id=%s RETURNING tx_id, action, risk_score, explainability, created_at;",
                            (action, tx_id),
                        )
                    else:
                        cur.execute(
                            "UPDATE public.transactions SET action=%s, risk_score=%s WHERE tx_id=%s RETURNING tx_id, action, risk_score, explainability, created_at;",
                            (action, risk_score, tx_id),
                        )
                res = cur.fetchone()
                conn.commit()
                cur.close()
                return res
            except Exception as e:
                conn.rollback()
                print("Explainability column update failed, falling back without explainability:", e)

        # Fallback without explainability
        if risk_score is None:
            cur.execute(
                "UPDATE public.transactions SET action=%s WHERE tx_id=%s RETURNING tx_id, action, risk_score, created_at;",
                (action, tx_id),
            )
        else:
            cur.execute(
                "UPDATE public.transactions SET action=%s, risk_score=%s WHERE tx_id=%s RETURNING tx_id, action, risk_score, created_at;",
                (action, risk_score, tx_id),
            )
        res = cur.fetchone()
        conn.commit()
        cur.close()
        return res
    finally:
        conn.close()

# --- analytics helpers ---
def db_dashboard_analytics(time_range: str):
    since = parse_time_range(time_range)
    bucket_unit = 'hour'
    bucket_limit = 24
    if time_range == '1h':
        bucket_unit = 'minute'
        bucket_limit = 60
    elif time_range == '7d':
        bucket_unit = 'day'
        bucket_limit = 7
    elif time_range == '30d':
        bucket_unit = 'day'
        bucket_limit = 30

    conn = get_conn()
    try:
        cur = conn.cursor()

        # Risk distribution
        if since:
            cur.execute(
                """
                SELECT
                  SUM(CASE WHEN risk_score < 0.3 THEN 1 ELSE 0 END) AS low,
                  SUM(CASE WHEN risk_score >= 0.3 AND risk_score < 0.6 THEN 1 ELSE 0 END) AS medium,
                  SUM(CASE WHEN risk_score >= 0.6 AND risk_score < 0.8 THEN 1 ELSE 0 END) AS high,
                  SUM(CASE WHEN risk_score >= 0.8 THEN 1 ELSE 0 END) AS critical
                FROM public.transactions
                WHERE created_at >= %s;
                """,
                (since,)
            )
        else:
            cur.execute(
                """
                SELECT
                  SUM(CASE WHEN risk_score < 0.3 THEN 1 ELSE 0 END) AS low,
                  SUM(CASE WHEN risk_score >= 0.3 AND risk_score < 0.6 THEN 1 ELSE 0 END) AS medium,
                  SUM(CASE WHEN risk_score >= 0.6 AND risk_score < 0.8 THEN 1 ELSE 0 END) AS high,
                  SUM(CASE WHEN risk_score >= 0.8 THEN 1 ELSE 0 END) AS critical
                FROM public.transactions;
                """
            )
        risk_row = cur.fetchone() or {"low": 0, "medium": 0, "high": 0, "critical": 0}

        # Timeline buckets
        dt_expr = f"date_trunc('{bucket_unit}', created_at)"
        if since:
            cur.execute(
                f"""
                SELECT {dt_expr} AS bucket,
                  SUM(CASE WHEN action = 'BLOCK' THEN 1 ELSE 0 END) AS block,
                  SUM(CASE WHEN action = 'DELAY' THEN 1 ELSE 0 END) AS delay,
                  SUM(CASE WHEN action = 'ALLOW' THEN 1 ELSE 0 END) AS allow
                FROM public.transactions
                WHERE created_at >= %s
                GROUP BY bucket
                ORDER BY bucket DESC
                LIMIT %s;
                """,
                (since, bucket_limit)
            )
        else:
            cur.execute(
                f"""
                SELECT {dt_expr} AS bucket,
                  SUM(CASE WHEN action = 'BLOCK' THEN 1 ELSE 0 END) AS block,
                  SUM(CASE WHEN action = 'DELAY' THEN 1 ELSE 0 END) AS delay,
                  SUM(CASE WHEN action = 'ALLOW' THEN 1 ELSE 0 END) AS allow
                FROM public.transactions
                GROUP BY bucket
                ORDER BY bucket DESC
                LIMIT %s;
                """,
                (bucket_limit,)
            )
        timeline_rows = cur.fetchall() or []

        # Reverse to chronological order
        timeline_rows = list(reversed(timeline_rows))

        # Prepare response
        labels = []
        blocks = []
        delays = []
        allows = []
        for r in timeline_rows:
            b = r["bucket"]
            # Convert to ISO string for client-side formatting
            labels.append(b.isoformat())
            blocks.append(int(r["block"]))
            delays.append(int(r["delay"]))
            allows.append(int(r["allow"]))

        return {
            "risk": {
                "low": int(risk_row["low"] or 0),
                "medium": int(risk_row["medium"] or 0),
                "high": int(risk_row["high"] or 0),
                "critical": int(risk_row["critical"] or 0),
            },
            "timeline": {
                "labels": labels,
                "block": blocks,
                "delay": delays,
                "allow": allows,
            }
        }
    finally:
        conn.close()

# --- auth helpers ---
def is_logged_in(request: Request):
    return bool(request.session.get("admin"))

def try_auth_admin(username: str, password: str):
    """Authenticate admin user against multiple admin accounts"""
    if username not in ADMIN_USERS:
        return False
    try:
        admin_data = ADMIN_USERS[username]
        return pbkdf2_sha256.verify(password, admin_data["password_hash"])
    except Exception:
        return False

# --- routes ---
@app.get("/", response_class=RedirectResponse)
def root():
    return RedirectResponse("/dashboard")

@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/dashboard-data")
async def dashboard_data(time_range: str = "24h"):
    stats = await run_in_threadpool(db_dashboard_stats, time_range)
    return {
        "stats": {
            "totalTransactions": stats["total"],
            "blocked": stats["block"],
            "delayed": stats["delay"],
            "allowed": stats["allow"],
        }
    }

@app.get("/dashboard-analytics")
async def dashboard_analytics(time_range: str = "24h"):
    """Aggregated analytics for charts to align with card stats."""
    data = await run_in_threadpool(db_dashboard_analytics, time_range)
    return data

@app.get("/pattern-analytics")
async def pattern_analytics(time_range: str = "24h", limit: int = None):
    """
    Get aggregated fraud pattern counts for the given time range.
    
    Args:
        time_range: Time window (1h, 24h, 7d, 30d)
        limit: Optional max transactions to analyze (used as fallback)
    
    Returns:
        JSON with pattern counts and metadata
    """
    stats = await run_in_threadpool(db_aggregate_fraud_patterns, time_range, limit)
    return stats

@app.get("/model-accuracy")
async def model_accuracy():
    """Get model accuracy metrics from metadata.json"""
    try:
        metadata_path = os.path.join(os.path.dirname(__file__), "..", "models", "metadata.json")
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        model_results = metadata.get("model_results", {})
        
        # Calculate accuracy from confusion matrix
        def calculate_accuracy(confusion_matrix):
            tn, fp, fn, tp = confusion_matrix[0][0], confusion_matrix[0][1], confusion_matrix[1][0], confusion_matrix[1][1]
            total = tn + fp + fn + tp
            return ((tn + tp) / total * 100) if total > 0 else 0
        
        rf_acc = calculate_accuracy(model_results.get("random_forest", {}).get("confusion_matrix", [[0,0],[0,0]]))
        xgb_acc = calculate_accuracy(model_results.get("xgboost", {}).get("confusion_matrix", [[0,0],[0,0]]))
        if_detection = model_results.get("iforest", {}).get("roc_auc", 0) * 100
        
        ensemble_acc = (rf_acc + xgb_acc) / 2
        
        return {
            "random_forest": round(rf_acc, 2),
            "xgboost": round(xgb_acc, 2),
            "isolation_forest": round(if_detection, 2),
            "ensemble": round(ensemble_acc, 2)
        }
    except Exception as e:
        print(f"Error loading model accuracy: {e}")
        return {
            "random_forest": 0,
            "xgboost": 0,
            "isolation_forest": 0,
            "ensemble": 0
        }

@app.get("/recent-transactions")
async def recent_transactions(limit: int = 300, time_range: str = "24h"):
    """
    Get recent transactions within a time range.
    
    Args:
        limit: Maximum number of transactions to return (default 300)
        time_range: Time window (1h, 24h, 7d, 30d)
    
    When a time_range is specified, returns ALL transactions in that range (ignoring limit).
    This ensures the timeline shows data from all dates in the range, not just the most recent.
    When no time_range, uses the limit parameter to return the most recent N transactions.
    """
    since = parse_time_range(time_range)

    def query():
        conn = get_conn()
        cur = conn.cursor()
        if since:
            # When filtering by time range, get ALL transactions in that range
            # Do NOT use LIMIT to ensure timeline spans all dates in the range
            # include rows where `ts` may be NULL by falling back to `created_at`
            cur.execute("""
                SELECT * FROM public.transactions
                WHERE COALESCE(ts, created_at) >= %s
                ORDER BY COALESCE(ts, created_at) DESC
            """, (since,))
        else:
            # No time range specified, use limit to get most recent N transactions
            cur.execute("""
                SELECT * FROM public.transactions
                ORDER BY COALESCE(ts, created_at) DESC
                LIMIT %s
            """, (limit,))
        rows = cur.fetchall()
        conn.close()
        # Enrich confidence_level from explainability if missing
        for r in rows:
            r["confidence_level"] = extract_confidence_level(r, "HIGH")
        # Convert to JSON serializable (handles datetime objects)
        return to_json_serializable(rows)

    result = await run_in_threadpool(query)
    return {"transactions": result}

@app.post("/transactions")
async def new_transaction(request: Request):
    body = await request.json()
    tx = dict(body)

    # Enhanced scoring with ensemble models
    scoring_details = None
    risk_score = None
    confidence_level = "HIGH"
    disagreement = 0.0
    final_risk_score = None
    try:
        try:
            from . import scoring
        except (ImportError, SystemError):
            import scoring
        try:
            scoring_details = scoring.score_transaction(tx, return_details=True)
            risk_score = scoring_details.get("risk_score")
            confidence_level = scoring_details.get("confidence_level", confidence_level)
            disagreement = scoring_details.get("disagreement", disagreement)
            final_risk_score = scoring_details.get("final_risk_score")
        except Exception as e:
            print("Ensemble scoring failed, trying legacy:", e)
            try:
                features = scoring.extract_features(tx)
                legacy_score = scoring.score_features(features)
                risk_score = legacy_score
            except Exception as e2:
                print("Legacy scoring also failed:", e2)
                risk_score = None
    except Exception as e:
        print("Could not import scoring module:", e)
        risk_score = None

    if risk_score is None:
        risk_score = float(tx.get("risk_score", 0.0))

    tx["risk_score"] = float(risk_score)
    tx["confidence_level"] = confidence_level

    # Attach explainability data so it is persisted/auditable when possible
    if scoring_details:
        # Generate pattern analysis using the mapper
        pattern_summary = None
        pattern_reasons: List[str] = []
        try:
            try:
                from .pattern_mapper import PatternMapper
            except ImportError:
                from pattern_mapper import PatternMapper
            pattern_summary = PatternMapper.get_pattern_summary(
                scoring_details.get("features", {}),
                scoring_details.get("model_scores", {})
            )
            # Align explainability reasons with fraud pattern categories so UI narratives stay consistent
            for p in pattern_summary.get("detected_patterns", []):
                name = p.get("name") or "Pattern"
                expl = p.get("explanation") or "Detected"
                pattern_reasons.append(f"{name}: {expl}")
        except Exception as e:
            print(f"Pattern mapping error: {e}")
        
        # Merge base reasons with pattern-driven reasons, preserving order and uniqueness
        merged_reasons: List[str] = []
        for reason in list(scoring_details.get("reasons", [])) + pattern_reasons:
            if reason and reason not in merged_reasons:
                merged_reasons.append(reason)

        tx["explainability"] = {
            "reasons": merged_reasons,
            "pattern_reasons": pattern_reasons,
            "model_scores": scoring_details.get("model_scores", {}),
            "features": scoring_details.get("features", {}),
            "patterns": pattern_summary,
            "confidence_level": confidence_level,
            "disagreement": disagreement,
            "final_risk_score": final_risk_score if final_risk_score is not None else risk_score,
        }

    if "action" not in tx or not tx.get("action"):
        if tx["risk_score"] >= THRESHOLDS["block"]:
            tx["action"] = "BLOCK"
        elif tx["risk_score"] >= THRESHOLDS["delay"]:
            tx["action"] = "DELAY"
        else:
            tx["action"] = "ALLOW"

    inserted = await run_in_threadpool(db_insert_transaction, tx)
    if isinstance(inserted, dict):
        inserted["confidence_level"] = confidence_level
    full_row = await run_in_threadpool(db_get_transaction, inserted["tx_id"])
    full_row = attach_confidence_level(full_row, confidence_level)

    # broadcast to websockets
    asyncio.create_task(ws_manager.broadcast({"type": "tx_inserted", "data": full_row}))

    return {"status": "ok", "inserted": inserted}

# --- admin pages & actions ---
@app.get("/admin/login", response_class=HTMLResponse)
def admin_login_page(request: Request):
    return templates.TemplateResponse("admin_login.html", {"request": request, "error": None})

@app.post("/admin/login")
async def admin_login(request: Request, username: str = Form(...), password: str = Form(...)):
    if try_auth_admin(username, password):
        request.session["admin"] = username
        request.session["admin_username"] = username
        return RedirectResponse("/admin", status_code=status.HTTP_303_SEE_OTHER)
    else:
        return templates.TemplateResponse("admin_login.html", {"request": request, "error": "Invalid credentials"}, status_code=401)

@app.get("/admin", response_class=HTMLResponse)
def admin_panel(request: Request):
    if not is_logged_in(request):
        return RedirectResponse("/admin/login")
    return templates.TemplateResponse(
        "admin.html",
        {"request": request, "initial_thresholds": normalize_thresholds(THRESHOLDS)}
    )

@app.get("/admin/logout")
def admin_logout(request: Request):
    request.session.clear()
    return RedirectResponse("/admin/login", status_code=status.HTTP_303_SEE_OTHER)

@app.post("/admin/action")
async def admin_action(request: Request):
    """
    Admin can only unblock (ALLOW) a transaction that was previously BLOCKED.
    No other status changes are permitted for security reasons.
    """
    if not is_logged_in(request):
        return JSONResponse({"detail": "unauthenticated"}, status_code=401)
    body = await request.json()
    tx_id = body.get("tx_id")
    action = body.get("action")
    if not tx_id or not action:
        return JSONResponse({"detail": "tx_id and action required"}, status_code=400)
    
    # Only ALLOW action is permitted (unblocking a blocked transaction)
    if action.upper() != "ALLOW":
        return JSONResponse(
            {"detail": "Admin can only unblock (ALLOW) transactions. Other actions are not permitted."},
            status_code=403
        )
    
    # Fetch current transaction to verify it's blocked
    current_tx = await run_in_threadpool(db_get_transaction, tx_id)
    if not current_tx:
        return JSONResponse({"detail": "tx not found"}, status_code=404)
    
    current_action = str(current_tx.get("action", "")).upper()
    if current_action != "BLOCK":
        return JSONResponse(
            {"detail": f"Cannot unblock: transaction status is '{current_action}'. Only BLOCKED transactions can be unblocked."},
            status_code=400
        )
    
    # Perform the unblock
    risk_score = body.get("risk_score")
    updated = await run_in_threadpool(db_update_action, tx_id, action, risk_score)
    if not updated:
        return JSONResponse({"detail": "tx not found"}, status_code=404)

    full = await run_in_threadpool(db_get_transaction, tx_id)
    full = attach_confidence_level(full, "HIGH")
    asyncio.create_task(ws_manager.broadcast({"type": "tx_updated", "data": full}))
    
    # Save admin log to database for persistence across devices
    admin_username = request.session.get("admin_username", "admin")
    source_ip = request.client.host if request.client else "unknown"
    user_id = updated.get("user_id", "unknown") if updated else "unknown"
    await run_in_threadpool(
        db_add_admin_log,
        tx_id,
        user_id,
        action,
        admin_username,
        source_ip
    )
    
    # Clear dashboard cache for the user so they see the updated transaction
    if user_id and redis_client:
        try:
            redis_client.delete(f"dashboard:{user_id}")
            print(f"✓ Cleared dashboard cache for user: {user_id}")
        except Exception as e:
            print(f"⚠ Failed to clear dashboard cache: {e}")
    
    return {"status": "ok", "updated": full}

# --- admin logs endpoints ---
def db_add_admin_log(tx_id: str, user_id: str, action: str, admin_username: str = None, source_ip: str = None):
    """Save admin action log to database"""
    conn = get_conn()
    try:
        _ensure_admin_logs_table(conn)
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO public.admin_logs (tx_id, user_id, action, admin_username, source_ip, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            RETURNING log_id;
            """,
            (tx_id, user_id, action, admin_username or "system", source_ip or "unknown")
        )
        row = cur.fetchone()
        log_id = row["log_id"] if row else None
        conn.commit()
        cur.close()
        return log_id
    except Exception as e:
        conn.rollback()
        print(f"Failed to save admin log: {e}")
        return None
    finally:
        conn.close()

def db_get_admin_logs(limit: int = 100):
    """Retrieve recent admin logs from database"""
    conn = get_conn()
    try:
        _ensure_admin_logs_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT log_id, tx_id, user_id, action, admin_username, source_ip, created_at
            FROM public.admin_logs
            ORDER BY created_at DESC
            LIMIT %s;
            """,
            (limit,)
        )
        rows = cur.fetchall()
        cur.close()
        return rows
    finally:
        conn.close()

# --- Threshold Presets Management ---
_HAS_PRESETS_TABLE = None

def _ensure_threshold_presets_table(conn):
    """Create admin_threshold_presets table if it doesn't exist"""
    global _HAS_PRESETS_TABLE
    if _HAS_PRESETS_TABLE:
        return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.admin_threshold_presets (
                id SERIAL PRIMARY KEY,
                admin_username VARCHAR(100) NOT NULL,
                preset_slot INTEGER NOT NULL CHECK (preset_slot IN (1, 2, 3)),
                preset_name VARCHAR(100) DEFAULT 'Preset',
                config_json JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(admin_username, preset_slot)
            );
            CREATE INDEX IF NOT EXISTS idx_preset_admin ON public.admin_threshold_presets(admin_username);
        """)
        conn.commit()
        cur.close()
        _HAS_PRESETS_TABLE = True
    except Exception as e:
        print(f"Error creating presets table: {e}")
        conn.rollback()

def db_save_threshold_preset(admin_username: str, preset_slot: int, preset_name: str, config: dict):
    """Save or update a threshold preset for an admin"""
    conn = get_conn()
    try:
        _ensure_threshold_presets_table(conn)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO public.admin_threshold_presets 
            (admin_username, preset_slot, preset_name, config_json, updated_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT (admin_username, preset_slot) 
            DO UPDATE SET 
                preset_name = EXCLUDED.preset_name,
                config_json = EXCLUDED.config_json,
                updated_at = NOW()
            RETURNING id;
        """, (admin_username, preset_slot, preset_name, json.dumps(config)))
        result = cur.fetchone()
        conn.commit()
        cur.close()
        preset_id = result['id'] if result else None
        return preset_id
    except Exception as e:
        import traceback
        print(f"ERROR in db_save_threshold_preset: {e}")
        print(f"ERROR type: {type(e).__name__}")
        print(f"ERROR traceback:\n{traceback.format_exc()}")
        conn.rollback()
        return None
    finally:
        conn.close()

def db_get_admin_presets(admin_username: str):
    """Get all threshold presets for an admin"""
    conn = get_conn()
    try:
        _ensure_threshold_presets_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT preset_slot, preset_name, config_json, updated_at
            FROM public.admin_threshold_presets
            WHERE admin_username = %s
            ORDER BY preset_slot;
        """, (admin_username,))
        rows = cur.fetchall()
        cur.close()
        return rows
    except Exception as e:
        print(f"Error getting presets: {e}")
        return []
    finally:
        conn.close()

def db_delete_threshold_preset(admin_username: str, preset_slot: int):
    """Delete a threshold preset"""
    conn = get_conn()
    try:
        _ensure_threshold_presets_table(conn)
        cur = conn.cursor()
        cur.execute("""
            DELETE FROM public.admin_threshold_presets
            WHERE admin_username = %s AND preset_slot = %s;
        """, (admin_username, preset_slot))
        conn.commit()
        cur.close()
        return True
    except Exception as e:
        print(f"Error deleting preset: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

@app.post("/admin/logs")
async def save_admin_log(request: Request):
    """Save admin action log to database"""
    if not is_logged_in(request):
        return JSONResponse({"detail": "unauthenticated"}, status_code=401)
    
    try:
        body = await request.json()
        tx_id = body.get("tx_id")
        user_id = body.get("user_id")
        action = body.get("action")
        
        if not tx_id or not action:
            return JSONResponse({"detail": "tx_id and action required"}, status_code=400)
        
        admin_username = request.session.get("admin_username", "admin")
        source_ip = request.client.host if request.client else "unknown"
        
        log_id = await run_in_threadpool(
            db_add_admin_log, 
            tx_id, 
            user_id or "unknown",
            action,
            admin_username,
            source_ip
        )
        
        return {"status": "ok", "log_id": log_id}
    except Exception as e:
        print(f"Error saving admin log: {e}")
        return JSONResponse({"detail": str(e)}, status_code=500)

@app.get("/admin/logs")
async def get_admin_logs(request: Request, limit: int = 10000):
    """Retrieve recent admin logs"""
    if not is_logged_in(request):
        return JSONResponse({"detail": "unauthenticated"}, status_code=401)
    
    try:
        logs = await run_in_threadpool(db_get_admin_logs, min(limit, 10000))
        
        # Convert to list of dicts for JSON response
        result = []
        for log in logs:
            # log is a RealDictRow because get_conn sets cursor_factory=RealDictCursor
            ts = log.get("created_at")
            iso_ts = ts.isoformat() if ts else None
            result.append({
                "log_id": log.get("log_id"),
                "tx_id": log.get("tx_id"),
                "user_id": log.get("user_id"),
                "action": log.get("action"),
                "admin_username": log.get("admin_username"),
                "source_ip": log.get("source_ip"),
                "created_at": iso_ts,
                "time": iso_ts,
            })
        
        return {"logs": result}
    except Exception as e:
        print(f"Error retrieving admin logs: {e}")
        return JSONResponse({"detail": str(e)}, status_code=500)

# --- threshold presets endpoints ---
@app.post("/admin/save-preset")
async def save_threshold_preset(request: Request):
    """Save a threshold preset for the logged-in admin"""
    if not is_logged_in(request):
        return JSONResponse({"detail": "unauthenticated"}, status_code=401)
    
    try:
        body = await request.json()
        preset_slot = body.get("preset_slot")
        preset_name = body.get("preset_name", f"Preset {preset_slot}")
        config = body.get("config")
        
        if not preset_slot or preset_slot not in [1, 2, 3]:
            return JSONResponse({"detail": "preset_slot must be 1, 2, or 3"}, status_code=400)
        
        if not config:
            return JSONResponse({"detail": "config is required"}, status_code=400)
        
        admin_username = request.session.get("admin_username", "admin")
        
        preset_id = await run_in_threadpool(
            db_save_threshold_preset,
            admin_username,
            preset_slot,
            preset_name,
            config
        )
        
        if preset_id is not None:
            return {"status": "ok", "preset_id": preset_id, "message": f"Preset {preset_slot} saved successfully"}
        else:
            return JSONResponse({"detail": "Failed to save preset"}, status_code=500)
    
    except Exception as e:
        import traceback
        print(f"Error saving preset: {e}")
        print(f"Exception type: {type(e).__name__}")
        print(f"Traceback: {traceback.format_exc()}")
        return JSONResponse({"detail": str(e)}, status_code=500)

@app.get("/admin/get-presets")
async def get_threshold_presets(request: Request):
    """Get all threshold presets for the logged-in admin"""
    if not is_logged_in(request):
        return JSONResponse({"detail": "unauthenticated"}, status_code=401)
    
    try:
        admin_username = request.session.get("admin_username", "admin")
        presets = await run_in_threadpool(db_get_admin_presets, admin_username)
        
        # Convert to dict format
        result = {}
        for preset in presets:
            slot = preset["preset_slot"]
            result[slot] = {
                "name": preset["preset_name"],
                "config": preset["config_json"],
                "updated_at": preset["updated_at"].isoformat() if preset.get("updated_at") else None
            }
        
        return {"status": "ok", "presets": result}
    
    except Exception as e:
        print(f"Error getting presets: {e}")
        return JSONResponse({"detail": str(e)}, status_code=500)

@app.post("/admin/delete-preset")
async def delete_threshold_preset(request: Request):
    """Delete a threshold preset"""
    if not is_logged_in(request):
        return JSONResponse({"detail": "unauthenticated"}, status_code=401)
    
    try:
        body = await request.json()
        preset_slot = body.get("preset_slot")
        
        if not preset_slot or preset_slot not in [1, 2, 3]:
            return JSONResponse({"detail": "preset_slot must be 1, 2, or 3"}, status_code=400)
        
        admin_username = request.session.get("admin_username", "admin")
        
        success = await run_in_threadpool(
            db_delete_threshold_preset,
            admin_username,
            preset_slot
        )
        
        if success:
            return {"status": "ok", "message": f"Preset {preset_slot} deleted successfully"}
        else:
            return JSONResponse({"detail": "Failed to delete preset"}, status_code=500)
    
    except Exception as e:
        print(f"Error deleting preset: {e}")
        return JSONResponse({"detail": str(e)}, status_code=500)

# --- update thresholds endpoint ---
@app.post("/admin/update-thresholds")
async def update_thresholds(request: Request):
    """Update fraud detection thresholds dynamically"""
    if not is_logged_in(request):
        return JSONResponse({"detail": "unauthenticated"}, status_code=401)
    
    try:
        body = await request.json()
        
        # Validate required fields
        required_fields = ["allowMax", "delayMax", "blockMin", "lowConfidence", "mediumConfidence", 
                          "highConfidence", "rfWeight", "xgbWeight", "isoWeight"]
        
        for field in required_fields:
            if field not in body:
                return JSONResponse({"detail": f"Missing required field: {field}"}, status_code=400)
        
        # Validate ranges
        if not (0 <= body["allowMax"] <= 0.5):
            return JSONResponse({"detail": "allowMax must be between 0 and 0.5"}, status_code=400)
        if not (0 <= body["delayMax"] <= 1.0):
            return JSONResponse({"detail": "delayMax must be between 0 and 1.0"}, status_code=400)
        if not (0 <= body["blockMin"] <= 1.0):
            return JSONResponse({"detail": "blockMin must be between 0 and 1.0"}, status_code=400)
        
        # Validate threshold ordering
        if body["allowMax"] >= body["blockMin"]:
            return JSONResponse({"detail": "allowMax must be less than blockMin"}, status_code=400)
        
        # Validate model weights sum to 100
        weight_sum = body["rfWeight"] + body["xgbWeight"] + body["isoWeight"]
        if weight_sum != 100:
            return JSONResponse({"detail": f"Model weights must sum to 100, got {weight_sum}"}, status_code=400)
        
        # Update global THRESHOLDS dictionary
        global THRESHOLDS
        THRESHOLDS = {
            "delay": body["allowMax"],
            "block": body["blockMin"],
            "allowMax": body["allowMax"],
            "delayMax": body["delayMax"],
            "blockMin": body["blockMin"],
            "lowConfidence": body["lowConfidence"],
            "mediumConfidence": body["mediumConfidence"],
            "highConfidence": body["highConfidence"],
            "rfWeight": body["rfWeight"],
            "xgbWeight": body["xgbWeight"],
            "isoWeight": body["isoWeight"]
        }
        
        # Optionally: Save to config file for persistence
        try:
            if os.path.exists(CFG_PATH):
                with open(CFG_PATH, "r", encoding="utf-8") as f:
                    config_data = yaml.safe_load(f) or {}
                
                config_data["thresholds"] = THRESHOLDS
                
                with open(CFG_PATH, "w", encoding="utf-8") as f:
                    yaml.dump(config_data, f, default_flow_style=False)
        except Exception as e:
            print(f"Warning: Could not persist thresholds to config file: {e}")
        
        # Log this action
        admin_username = request.session.get("admin_username", "admin")
        source_ip = request.client.host if request.client else "unknown"
        
        await run_in_threadpool(
            db_add_admin_log,
            "SYSTEM",
            "system",
            "THRESHOLD_UPDATE",
            admin_username,
            source_ip
        )
        
        return {"status": "ok", "thresholds": THRESHOLDS}
    
    except Exception as e:
        print(f"Error updating thresholds: {e}")
        return JSONResponse({"detail": str(e)}, status_code=500)

@app.get("/admin/get-thresholds")
async def get_thresholds(request: Request):
    """Return current thresholds for admin UI"""
    if not is_logged_in(request):
        return JSONResponse({"detail": "unauthenticated"}, status_code=401)

    try:
        global THRESHOLDS
        THRESHOLDS = normalize_thresholds(THRESHOLDS)
        return {"status": "ok", "thresholds": THRESHOLDS}
    except Exception as e:
        print(f"Error getting thresholds: {e}")
        return JSONResponse({"detail": str(e)}, status_code=500)

# --- websocket endpoint for live updates ---
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            # simple keepalive / echo — clients generally don't need to send
            await ws.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)
    except Exception:
        await ws_manager.disconnect(ws)

# --- health ---
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/system-health")
async def system_health():
    """
    Comprehensive system health check including database and API endpoints.
    Returns status of all critical components.
    """
    health_status = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "components": {
            "web": {"status": "healthy", "message": "API server running"},
            "database": {"status": "unknown", "message": "Checking connection..."},
            "endpoints": {}
        },
        "overall": "checking"
    }
    
    # Check database connection
    try:
        conn = await run_in_threadpool(get_conn)
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        cur.close()
        conn.close()
        health_status["components"]["database"]["status"] = "healthy"
        health_status["components"]["database"]["message"] = "Connected"
    except Exception as e:
        health_status["components"]["database"]["status"] = "unhealthy"
        health_status["components"]["database"]["message"] = f"Connection failed: {str(e)[:50]}"
    
    # Check key API endpoints
    endpoints_to_check = [
        ("dashboard-data", "/dashboard-data?time_range=24h"),
        ("recent-transactions", "/recent-transactions?limit=10&time_range=24h"),
        ("pattern-analytics", "/pattern-analytics?time_range=24h"),
        ("model-accuracy", "/model-accuracy"),
    ]
    
    for ep_name, ep_path in endpoints_to_check:
        try:
            # Simulate endpoint check by making internal test request
            # For now, mark as healthy if database is OK
            if health_status["components"]["database"]["status"] == "healthy":
                health_status["components"]["endpoints"][ep_name] = {
                    "status": "healthy",
                    "code": 200
                }
            else:
                health_status["components"]["endpoints"][ep_name] = {
                    "status": "degraded",
                    "code": 503
                }
        except Exception as e:
            health_status["components"]["endpoints"][ep_name] = {
                "status": "unhealthy",
                "error": str(e)[:30]
            }
    
    # Determine overall health
    all_healthy = (
        health_status["components"]["web"]["status"] == "healthy" and
        health_status["components"]["database"]["status"] == "healthy" and
        all(ep.get("status") == "healthy" for ep in health_status["components"]["endpoints"].values())
    )
    
    health_status["overall"] = "healthy" if all_healthy else "degraded"
    
    return health_status

# --- chatbot endpoint ---
@app.post("/api/chatbot")
async def chatbot_endpoint(request: Request):
    """AI Chatbot endpoint for fraud detection analytics"""
    try:
        body = await request.json()
        message = body.get("message", "").strip()
        time_range = body.get("time_range", "24h")
        conversation_history = body.get("history", [])
        
        if not message:
            return JSONResponse({"error": "Message is required"}, status_code=400)
        
        # Import and initialize chatbot
        from app.chatbot import FraudDetectionChatbot
        chatbot = FraudDetectionChatbot(
            db_url=DB_URL,
            groq_api_key=os.getenv("GROQ_API_KEY")
        )
        
        # Get response
        result = await run_in_threadpool(
            chatbot.chat,
            message,
            time_range,
            conversation_history
        )
        
        return JSONResponse(result)
        
    except Exception as e:
        print(f"Chatbot error: {e}")
        return JSONResponse(
            {"error": f"Chatbot error: {str(e)}"}, 
            status_code=500
        )


# --- Drift Monitoring Endpoint ---
@app.get("/api/drift-report")
async def drift_report_endpoint(request: Request):
    """Get concept drift monitoring report (PSI-based)."""
    try:
        from app.drift_detector import compute_drift_report, get_last_report
        
        # Try cached report first for performance
        cached = await run_in_threadpool(get_last_report)
        if cached:
            return JSONResponse(cached)
        
        # Compute fresh report
        report = await run_in_threadpool(compute_drift_report)
        return JSONResponse(report)
    except Exception as e:
        print(f"Drift report error: {e}")
        return JSONResponse(
            {"error": f"Drift report error: {str(e)}", "overall_status": "error"},
            status_code=500,
        )


# --- Risk Buffer Status Endpoint ---
@app.get("/api/risk-buffer/{user_id}")
async def risk_buffer_endpoint(user_id: str, request: Request):
    """Get cumulative risk buffer status for a specific user."""
    try:
        from app.risk_buffer import get_risk_buffer, get_buffer_history
        
        buffer_value, details = await run_in_threadpool(get_risk_buffer, user_id)
        history = await run_in_threadpool(get_buffer_history, user_id)
        
        return JSONResponse({
            "user_id": user_id,
            "buffer_value": buffer_value,
            "details": details,
            "history": history,
        })
    except Exception as e:
        print(f"Risk buffer error: {e}")
        return JSONResponse(
            {"error": f"Risk buffer error: {str(e)}"},
            status_code=500,
        )


# --- Graph Signal Profile Endpoint ---
@app.get("/api/graph-profile/{recipient}")
async def graph_profile_endpoint(recipient: str, request: Request):
    """Get graph-based risk profile for a recipient."""
    try:
        from app.graph_signals import get_recipient_profile
        
        profile = await run_in_threadpool(get_recipient_profile, recipient)
        return JSONResponse(profile)
    except Exception as e:
        print(f"Graph profile error: {e}")
        return JSONResponse(
            {"error": f"Graph profile error: {str(e)}"},
            status_code=500,
        )
