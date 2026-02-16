# FDT - UPI Fraud Detection System

> Real-time fraud detection using ensemble ML models with explainable AI reasoning

[![Python](https://img.shields.io/badge/Python-3.13-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.123-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 Features

- **Ensemble ML Models**: Isolation Forest + Random Forest + XGBoost (98%+ ROC-AUC)
- **Explainable AI**: Human-readable fraud reasons across 10 risk categories
- **27 Engineered Features**: Temporal, behavioral, velocity, and statistical patterns
- **Real-time Detection**: <100ms fraud scoring with Redis caching
- **Two-tier Architecture**: Separate user and admin interfaces
- **Progressive Web App**: Offline-capable React frontend
- **AI Chatbot**: Groq-powered fraud analysis assistant

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.11+ with Conda
- Node.js 16+

### One-Command Launch

```bash
# Start user app + backend
bash start.sh

# Start with admin dashboard
bash start.sh --admin
```

**Access Points:**
- **User App**: http://localhost:3000
- **User API**: http://localhost:8001 (API Docs: /docs)
- **Admin Dashboard**: http://localhost:8000 (with --admin flag)

### Demo Credentials
```
Phone: +919876543210
Password: password123
```

---

## 📁 Project Structure

```
FDT/
├── app/                    # Admin backend (FastAPI)
│   ├── main.py            # Admin dashboard server
│   ├── scoring.py         # ML ensemble scoring
│   ├── fraud_reasons.py   # Explainability engine
│   ├── feature_engine.py  # Feature extraction
│   └── chatbot.py         # AI assistant
├── backend/               # User backend (FastAPI)
│   ├── server.py          # User-facing API
│   └── init_schema.sql    # Database schema
├── frontend/              # React PWA
│   └── src/
│       ├── components/    # React components
│       └── api.js         # API client
├── models/                # Trained ML models
│   ├── iforest.joblib
│   ├── random_forest.joblib
│   ├── xgboost.joblib
│   └── metadata.json
├── tests/                 # Test suite
├── train/                 # Model training scripts
├── tools/                 # Utilities
├── docker-compose.yml     # Docker services
└── .env.example          # Environment template
```

---

## 🏗️ Architecture

### Two Backend Servers

**1. User Backend** (`backend/server.py` - Port 8001)
- User authentication (JWT)
- Transaction processing
- Fraud detection API
- User dashboard

**2. Admin Dashboard** (`app/main.py` - Port 8000)
- System-wide analytics
- Real-time monitoring
- Transaction oversight
- Model performance metrics

### Data Flow
```
Frontend (React)
    ↓
User Backend (FastAPI:8001)
    ↓
PostgreSQL (Docker:5432) + Redis (Docker:6379)
    ↓
ML Models (Ensemble)
    ↓
Admin Dashboard (FastAPI:8000)
```

---

## ⚙️ Setup & Installation

### 1. Clone & Configure

```bash
git clone <repository-url>
cd Fraud-Detection-in-UPI---FDT2

# Copy environment template
cp .env.example .env
# Edit .env with your credentials
```

### 2. Start Docker Services

```bash
docker compose up -d
```

### 3. Setup Python Environment

```bash
conda create -n dev python=3.11
conda activate dev
pip install -r requirements.txt
```

### 4. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 5. Start Services

```bash
# Option A: Automated start
bash start.sh --admin

# Option B: Manual start
# Terminal 1: User backend
python backend/server.py

# Terminal 2: Admin dashboard
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3: Frontend
cd frontend && npm start
```

---

## 🧪 Testing

```bash
# Run all tests
python -m pytest tests/

# Run specific test file
python tests/test_fraud_reasons.py

# Run with coverage
python -m pytest tests/ --cov=app --cov-report=html
```

---

## 📊 Transaction Simulator

Generate realistic test transactions:

```bash
# Login and get token
python simulator.py --register

# Run normal transactions
python simulator.py --token <YOUR_TOKEN> --pattern normal --count 10

# Run suspicious transactions
python simulator.py --token <YOUR_TOKEN> --pattern suspicious --count 5

# Available patterns: normal, suspicious, high_risk, burst
```

**Options:**
- `--count N`: Number of transactions (default: infinite)
- `--delay N`: Delay between transactions in seconds (default: 0.5)
- `--pattern`: Transaction pattern (normal, suspicious, high_risk, burst)

---

## 🤖 ML Models

### Training

```bash
# Train all models
python train/train_models.py

# Train Isolation Forest only
python train/train_iforest.py

# Evaluate models
python tools/evaluate_model.py
```

### Model Performance
- **Training Samples**: 7,700 (70% train, 30% test)
- **Features**: 27 engineered features
- **Fraud Rate**: 9% in training data

| Model | ROC-AUC | Precision-Recall AUC |
|-------|---------|---------------------|
| Isolation Forest | 0.954 | N/A |
| Random Forest | 0.989 | 0.943 |
| XGBoost | 0.988 | 0.939 |

### Features (27)
- **Basic (3)**: amount, log_amount, is_round_amount
- **Temporal (6)**: hour_of_day, month, day_of_week, is_weekend, is_night, is_business_hours
- **Velocity (5)**: tx_count_1h, tx_count_6h, tx_count_24h, tx_count_1min, tx_count_5min
- **Behavioral (6)**: is_new_recipient, recipient_tx_count, is_new_device, device_count, is_p2m, is_p2p
- **Statistical (4)**: amount_mean, amount_std, amount_max, amount_deviation
- **Risk (3)**: merchant_risk_score, is_qr_channel, is_web_channel

---

## 🔐 Security

- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: Argon2 hashing
- **Environment Variables**: Secrets in .env (not committed)
- **CORS**: Configurable origins
- **Input Validation**: Pydantic models

**⚠️ Production Checklist:**
1. Change `JWT_SECRET_KEY` in .env
2. Use strong admin password
3. Enable HTTPS
4. Configure CORS whitelist
5. Set up rate limiting
6. Use production database credentials

---

## 📡 API Reference

### User Endpoints (Port 8001)

```bash
POST /api/register          # Register new user
POST /api/login             # User login (returns JWT)
POST /api/transaction       # Create transaction
GET  /api/dashboard-data    # User dashboard
GET  /api/transactions      # Transaction history
POST /api/user-decision     # Submit fraud feedback
```

### Admin Endpoints (Port 8000)

```bash
GET  /                      # Admin dashboard UI
POST /admin/login           # Admin login
GET  /api/dashboard-data    # System-wide statistics
GET  /api/activity-feed     # Recent activity
POST /api/chatbot/query     # AI chatbot
```

### Example: Create Transaction

```bash
curl -X POST http://localhost:8001/api/transaction \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "recipient_vpa": "merchant@paytm",
    "tx_type": "P2M",
    "channel": "app"
  }'
```

**Response:**
```json
{
  "tx_id": "260214000001",
  "fraud_score": 0.45,
  "risk_level": "MEDIUM",
  "action": "DELAY",
  "fraud_reasons": [
    {
      "reason": "Transaction amount unusual for user",
      "severity": "medium",
      "feature": "amount_deviation",
      "value": 2.5
    }
  ]
}
```

---

## 📝 Transaction ID Format

All transactions use a standardized 12-digit UPI transaction ID in the format: **YYMMDDXXXXXX**

### Format Breakdown
- **YYMMDD** (6 digits): Date component
  - YY: Year (2-digit, e.g., 26 for 2026)
  - MM: Month (2-digit, 01-12)
  - DD: Day (2-digit, 01-31)
  - Example: `260214` = February 14, 2026

- **XXXXXX** (6 digits): Sequential number (000001-999999)
  - Increments for each transaction on a given date
  - Resets daily
  - Example: `000001`, `000002`, etc.

### Examples
- `260214000001` - First transaction on Feb 14, 2026
- `260214000023` - 23rd transaction on Feb 14, 2026
- `260215000001` - First transaction on Feb 15, 2026 (date changed, sequence resets)

### Implementation
Transaction IDs are generated automatically by the backend using the `generate_upi_transaction_id()` function in `app/upi_transaction_id.py`. Users do not specify transaction IDs; they are created server-side to ensure uniqueness and date-based tracking.

---

## 🔄 Database Migration (For Existing Systems)

If you're upgrading from a previous version with UUID-based transaction IDs, run the migration script to update existing transactions:

```bash
# Activate conda dev environment
source /home/aakash/miniconda3/etc/profile.d/conda.sh
conda activate dev

# Run migration
python tools/migrate_transaction_id_format.py
```

**What the migration does:**
1. Creates a temporary table with the new schema (tx_id VARCHAR(12))
2. Migrates all existing transactions with UUID IDs to new 12-digit UPI format
3. Updates all foreign key references in related tables:
   - `fraud_alerts` table
   - `transaction_ledger` table
   - `admin_logs` table
4. Recreates indexes for optimal performance
5. Swaps old table with new table

**⚠️ Important Notes:**
- Make a database backup before running migration
- Migration may take several minutes for large transaction volumes
- The process maintains data integrity with transactions
- Old transaction IDs are preserved temporarily for reference during migration
- Database indexes are automatically recreated

---

## 🛠️ Troubleshooting

### Common Issues

**Port Already in Use:**
```bash
# Kill processes on ports 3000, 8000, 8001
bash kill_frontend.sh
lsof -ti:8000 | xargs kill -9
lsof -ti:8001 | xargs kill -9
```

**Database Connection Error:**
```bash
# Restart Docker services
docker compose restart db
# Check connection
docker compose exec db pg_isready -U fdt
```

**Redis Connection Error:**
```bash
# Restart Redis
docker compose restart redis
# Verify
docker compose exec redis redis-cli ping
```

**Frontend Build Errors:**
```bash
# Clear cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install
```

**Model Not Found:**
```bash
# Verify models exist
ls -lh models/*.joblib
# Retrain if missing
python train/train_models.py
```

---

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Database
DB_URL=postgresql://fdt:fdtpass@127.0.0.1:5432/fdt_db

# Redis
REDIS_URL=redis://localhost:6379/0

# Security
JWT_SECRET_KEY=your_secret_key_here

# Groq AI (Optional - for chatbot)
GROQ_API_KEY=your_groq_api_key

# Fraud Thresholds
DELAY_THRESHOLD=0.35
BLOCK_THRESHOLD=0.70
```

### Docker Compose Ports

```yaml
services:
  db:
    ports: ["5432:5432"]
  redis:
    ports: ["6379:6379"]
```

---

## 📈 Performance Optimization

### Redis Caching
- User history: 24-hour TTL
- Feature vectors: 1-hour TTL
- Transaction velocity: 5-minute TTL

### Database Indexing
```sql
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_user_history_user ON user_history(user_id);
```

### Model Inference
- Lazy loading: Models loaded on first request
- Batch prediction: Not yet implemented
- Feature caching: Redis-backed

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Follow code style in AGENTS.md
4. Add tests for new features
5. Commit changes (`git commit -m 'feat: Add AmazingFeature'`)
6. Push to branch (`git push origin feature/AmazingFeature`)
7. Open Pull Request

---

## 📝 Scripts Reference

| Script | Description |
|--------|-------------|
| `start.sh` | Start user backend + frontend |
| `start.sh --admin` | Start user backend + admin + frontend |
| `start_admin.sh` | Start admin dashboard only |
| `stop.sh` | Stop all services |
| `kill_frontend.sh` | Kill frontend on port 3000 |
| `deploy.sh` | Production deployment script |
| `simulator.py` | Transaction simulator |
| `seed_users.py` | Seed demo users |

---

## 📚 Additional Documentation

- **Code Style Guide**: See AGENTS.md
- **API Testing**: See docs/API_TESTING.md
- **Fraud Patterns**: See docs/FRAUD_PATTERN_TECHNICAL_EXPLANATION.md

---

## 📄 License

This project is licensed under the MIT License.

---

## 👥 Team

**Tenzor.Nex @ ImpactX 2.0**

---

## 🙏 Acknowledgments

- FastAPI framework
- Scikit-learn & XGBoost
- React & TailwindCSS
- Groq AI
- Docker & PostgreSQL community

---

**Built with ❤️ for safer digital payments**
