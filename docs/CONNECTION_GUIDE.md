# FDT Connection Configuration Guide

This document details all database and server connections in the FDT system.

## 📊 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
│                       Port 3000                                  │
│           REACT_APP_BACKEND_URL → localhost:8001                │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/REST
┌─────────────────────────────────────────────────────────────────┐
│                    USER BACKEND SERVER                          │
│                  (backend/server.py)                            │
│                       Port 8001                                 │
│  Handles: User registration, transactions, fraud detection     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
          ┌───────────────────┴──────────────────┐
          ↓                                      ↓
    ┌─────────────┐                    ┌─────────────────┐
    │ PostgreSQL  │                    │     Redis       │
    │  Port 5432  │                    │   Port 6379     │
    │  (Primary)  │                    │ (Cache/Optional)│
    └─────────────┘                    └─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   ADMIN DASHBOARD SERVER                        │
│                   (app/main.py)                                 │
│                       Port 8000                                 │
│  Handles: System monitoring, admin functions, analytics        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
    ┌─────────────┐                    ┌─────────────────┐
    │ PostgreSQL  │                    │     Redis       │
    │  Port 5432  │                    │   Port 6379     │
    │ (Shared DB) │                    │ (Shared Cache)  │
    └─────────────┘                    └─────────────────┘
```

## 🔌 Connection URLs and Credentials

### PostgreSQL Database

**Configuration Files:**
- Primary: `config/config.yaml` → `db_url`
- Override: Environment variable `DB_URL`
- Fallback: Default in code

**Connection URL:**
```
postgresql://fdt:fdtpass@127.0.0.1:5432/fdt_db
```

**Components:**
- **User**: `fdt`
- **Password**: `fdtpass`
- **Host**: `127.0.0.1` (localhost)
- **Port**: `5432` (standard PostgreSQL)
- **Database**: `fdt_db`

**Docker Compose Service:**
```yaml
db:
  image: postgres:14
  environment:
    POSTGRES_USER: fdt
    POSTGRES_PASSWORD: fdtpass
    POSTGRES_DB: fdt_db
  ports:
    - "5432:5432"
```

### Redis Cache

**Connection URL:**
```
redis://localhost:6379/0
```

**Configuration:**
- **Host**: `localhost`
- **Port**: `6379` (standard Redis)
- **Database**: `0` (default)

**Status:** Optional (system falls back to non-cached mode if unavailable)

**Docker Compose Service:**
```yaml
redis:
  image: redis:6
  ports:
    - "6379:6379"
```

## 📝 Environment Variable Configuration

### Root `.env` File

**Location:** `/root/.env`

**Variables:**
```bash
# Database Connection
DB_URL=postgresql://fdt:fdtpass@127.0.0.1:5432/fdt_db

# Redis Cache (optional)
REDIS_URL=redis://localhost:6379/0

# JWT Security
JWT_SECRET_KEY=change_this_to_random_secret_in_production

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=your_admin_password_hash_here

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000

# Fraud Detection Thresholds
DELAY_THRESHOLD=0.35
BLOCK_THRESHOLD=0.70

# AI Chatbot
GROQ_API_KEY=your_groq_api_key_here
```

### Frontend `.env` File

**Location:** `frontend/.env`

**Variables:**
```bash
REACT_APP_BACKEND_URL=http://localhost:8001
REACT_APP_FIREBASE_ENABLED=false
```

**Important:** This URL must match the backend server's address and port.

### Configuration File

**Location:** `config/config.yaml`

**Key Variables:**
```yaml
db_url: postgresql://fdt:fdtpass@127.0.0.1:5432/fdt_db
secret_key: qdqBymrlHc4wrM_E2TfifjUjnEsjxh-9NGKCQaecrQw

admin_users:
  - username: jerold
    password_hash: $pbkdf2-sha256$...
    role: Super Admin

thresholds:
  delay: 0.3          # Risk score for DELAY action
  block: 0.6          # Risk score for BLOCK action
  delayMax: 0.6
  blockMin: 0.6
  allowMax: 0.3
  highConfidence: 0.85
  lowConfidence: 0.4
  mediumConfidence: 0.7
```

## 🖥️ Backend Server Connections

### User Backend Server (Port 8001)

**File:** `backend/server.py`

**Connection Configuration:**
```python
# Database
DB_URL = os.getenv("DB_URL") or cfg_db_url or DEFAULT_DB_URL
# → Tries environment first, then config.yaml, then default

# Redis Cache
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# JWT Secret
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "default_dev_key")

# CORS Origins
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8000")
```

**Startup:**
```bash
source /home/aakash/miniconda3/etc/profile.d/conda.sh
conda activate dev
python backend/server.py
```

**Endpoints:**
- `POST /api/register` - User registration
- `POST /api/login` - User authentication
- `POST /api/transaction` - Create transaction
- `GET /api/transactions` - Get transaction history
- `GET /api/dashboard-data` - User dashboard

### Admin Dashboard Server (Port 8000)

**File:** `app/main.py`

**Connection Configuration:**
```python
# Database
DB_URL = os.getenv("DB_URL") or cfg.get("db_url")

# Config from file
config_path = "config/config.yaml"
cfg = load_config(config_path)

# Admin authentication
admin_users = cfg.get("admin_users", [])
```

**Startup:**
```bash
source /home/aakash/miniconda3/etc/profile.d/conda.sh
conda activate dev
python -m app.main
```

**Endpoints:**
- `GET /` - Dashboard UI
- `POST /admin/login` - Admin authentication
- `GET /api/dashboard-data` - System statistics
- `GET /api/activity-feed` - Transaction feed
- `POST /api/chatbot/query` - AI chatbot

### Frontend (React)

**File:** `frontend/src`

**Connection Configuration:**
```javascript
// In frontend/.env
REACT_APP_BACKEND_URL=http://localhost:8001

// In API calls
const API_BASE = process.env.REACT_APP_BACKEND_URL
```

**Startup:**
```bash
cd frontend
npm install
npm start
```

**Accesses:**
- http://localhost:3000 - User app
- Connects to backend at http://localhost:8001

## 🔍 Database Schema

### Tables

All tables are in the `fdt_db` database on PostgreSQL:

1. **users** - User accounts and profiles
2. **transactions** - Transaction records with fraud scores
3. **user_devices** - Registered user devices
4. **fraud_alerts** - Fraud detection alerts
5. **user_behavior** - User behavioral profiles
6. **push_tokens** - FCM push notification tokens
7. **transaction_ledger** - Audit trail for balance operations
8. **user_daily_transactions** - Daily transaction aggregates
9. **admin_logs** - Admin action audit trail

### Connection Requirements

- **tx_id Column**: Now uses VARCHAR(12) for 12-digit UPI format
- **Indexes**: Optimized for user_id, created_at, and composite queries
- **Foreign Keys**: Cascade delete relationships maintained

## 🧪 Testing Connections

### Run Connection Test

```bash
python /tmp/test_connections.py
```

Or use the included test script:

```bash
source /home/aakash/miniconda3/etc/profile.d/conda.sh
conda activate dev
python tests/test_db_conn.py
```

### Test Database Connection

```bash
# Direct PostgreSQL connection
psql postgresql://fdt:fdtpass@127.0.0.1:5432/fdt_db

# Test query
SELECT version();
SELECT COUNT(*) FROM transactions;
```

### Test Redis Connection

```bash
# Using redis-cli
redis-cli ping
redis-cli INFO server

# Using Python
python -c "import redis; r = redis.from_url('redis://localhost:6379/0'); print(r.ping())"
```

## 🚀 Full System Startup

### Using Docker Compose

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Manual Startup (Development)

**Terminal 1 - Database:**
```bash
docker compose up -d db redis
```

**Terminal 2 - Backend Server:**
```bash
source /home/aakash/miniconda3/etc/profile.d/conda.sh
conda activate dev
python backend/server.py
```

**Terminal 3 - Admin Dashboard:**
```bash
source /home/aakash/miniconda3/etc/profile.d/conda.sh
conda activate dev
python -m app.main
```

**Terminal 4 - Frontend:**
```bash
cd frontend
npm start
```

### Verify All Services Running

```bash
# Check ports
netstat -tuln | grep -E "3000|8000|8001|5432|6379"

# Or use lsof
lsof -i:3000
lsof -i:8000
lsof -i:8001
lsof -i:5432
lsof -i:6379
```

## 🔗 Cross-Server Communication

### Frontend → Backend API

**Request Flow:**
1. React component calls API
2. Uses `REACT_APP_BACKEND_URL` from .env
3. Makes HTTP request to `http://localhost:8001/api/*`
4. Backend processes request
5. Accesses PostgreSQL and Redis
6. Returns JSON response

**Example:**
```javascript
fetch(`${process.env.REACT_APP_BACKEND_URL}/api/transactions`, {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

### Admin Dashboard → Database

**Query Flow:**
1. Admin interface at `http://localhost:8000`
2. User logs in (authentication via config.yaml admin users)
3. Queries database using `DB_URL` from environment
4. Optionally caches results in Redis
5. Renders dashboard with data

### Backend → Database & Cache

**Operation Flow:**
1. User makes API request to backend
2. Backend retrieves/validates user
3. Extracts transaction features
4. Scores with ML models
5. **Writes to**: transactions table
6. **Reads from/Writes to**: Redis cache (if available)
7. Returns fraud score and reasons

## ⚠️ Common Connection Issues

### Issue: "Cannot connect to PostgreSQL"

**Solutions:**
1. Check Docker container running: `docker compose ps`
2. Verify credentials in .env: `DB_URL=postgresql://fdt:fdtpass@127.0.0.1:5432/fdt_db`
3. Restart database: `docker compose restart db`
4. Check logs: `docker compose logs db`

### Issue: "Redis connection refused"

**Solutions:**
1. Redis is optional - system continues without it
2. Check if running: `docker compose ps redis`
3. Restart: `docker compose restart redis`
4. Test: `redis-cli ping`

### Issue: "Frontend can't reach backend"

**Solutions:**
1. Check frontend .env: `REACT_APP_BACKEND_URL=http://localhost:8001`
2. Verify backend running: `lsof -i:8001`
3. Check CORS settings in backend
4. Rebuild frontend: `npm run build`

### Issue: "Transaction ID format error"

**Solutions:**
1. Verify UPI Transaction ID module: `python app/upi_transaction_id.py`
2. Check if IDs are 12 digits: `260214000001`
3. Run migration if needed: `python tools/migrate_transaction_id_format.py`

## 📋 Connection Checklist

- [ ] PostgreSQL running and accessible on port 5432
- [ ] Redis running on port 6379 (optional)
- [ ] `.env` file configured with correct DB_URL
- [ ] `frontend/.env` has correct REACT_APP_BACKEND_URL
- [ ] `config/config.yaml` has valid database credentials
- [ ] Backend server starts on port 8001 without errors
- [ ] Admin dashboard starts on port 8000 without errors
- [ ] Frontend builds and starts on port 3000
- [ ] Database schema initialized with all 9 tables
- [ ] Transaction ID generator working (12-digit format)
- [ ] CORS configured for all three ports (3000, 8000, 8001)
- [ ] No port conflicts with other services

## 📞 Support

For connection issues:
1. Run test script: `python /tmp/test_connections.py`
2. Check logs: `docker compose logs`
3. Verify environment: `echo $DB_URL $REDIS_URL $REACT_APP_BACKEND_URL`
4. Review this guide for configuration details

