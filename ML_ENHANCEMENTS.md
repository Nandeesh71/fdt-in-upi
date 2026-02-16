# UPI Fraud Detection System - ML Enhancements Documentation

## Overview

This document describes the 5 major ML improvements implemented in the UPI Fraud Detection System (FDT2).

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSACTION INPUT                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  FEATURE EXTRACTION (amount, time, device, velocity, etc.)      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: TRUST SCORE LOOKUP (trust_engine.py)                  │
│  • Calculates gradual trust discount based on transaction       │
│    history with recipient                                       │
│  • Formula: min(0.70, tx_count × 0.10, total_amount/10000)     │
│  • Fraud flags reduce trust immediately                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: GRAPH RISK ANALYSIS (graph_signals.py)                │
│  • Fraud ratio: % of senders blocked for this recipient        │
│  • Centrality: Network hub detection                           │
│  • Shared device risk: Multiple users on same device           │
│  • Blends with base risk: 0.6 × ml_risk + 0.4 × graph_risk     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: CUMULATIVE RISK BUFFER (risk_buffer.py)               │
│  • Per-user accumulator tracking historical risk               │
│  • BLOCK: +0.5 | DELAY: +0.3 | High risk (>0.25): +0.2        │
│  • Decay: 10% per week with clean transactions                 │
│  • Prevents "slow-burn" fraud attacks                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: DYNAMIC THRESHOLDS (dynamic_thresholds.py)            │
│  • Personalizes DELAY/BLOCK thresholds per user                │
│  • Factors: Risk buffer, amount, account age, time, device     │
│  • Base: DELAY=0.25, BLOCK=0.40                               │
│  • Formula: max(0.35, 0.40 - (buffer - 1.0) × 0.05)          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: DRIFT DETECTION (drift_detector.py)                   │
│  • PSI (Population Stability Index) monitoring                 │
│  • Compares training baseline vs live features                 │
│  • Thresholds: PSI > 0.1 minor, PSI > 0.25 major               │
│  • Alerts when model retraining needed                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  FINAL ACTION: ALLOW / DELAY / BLOCK                           │
│  • Risk score compared to dynamic thresholds                   │
│  • DELAY transactions require user confirmation                │
│  • BLOCK transactions rejected immediately                     │
└─────────────────────────────────────────────────────────────────┘
```

## ML Components

### 1. Trust Engine (`app/trust_engine.py`)

**Purpose:** Builds trust gradually through repeated successful transactions.

**Key Features:**
- Per-user, per-recipient trust scores
- 90-day TTL on trust data
- Fraud flags reduce trust by 50%
- Formula: `discount = min(0.70, tx_count × 0.10, total_amount/10000 × 0.05)`

**Usage:**
```python
from app.trust_engine import TrustEngine
trust_engine = TrustEngine(redis_client)
discount = trust_engine.get_trust_discount(user_id, recipient_vpa)
```

**Redis Keys:**
- `trust:{user_id}:{recipient}:tx_count`
- `trust:{user_id}:{recipient}:total_amount`
- `trust:{user_id}:{recipient}:first_tx`
- `trust:{user_id}:{recipient}:fraud_flags`

### 2. Risk Buffer (`app/risk_buffer.py`)

**Purpose:** Cumulative risk accumulator preventing slow-burn fraud.

**Accumulation Rules:**
- BLOCK action: +0.5
- DELAY action: +0.3
- High risk score (>0.25): +0.2
- Normal transactions: +0.05

**Decay:**
- 10% per week with no incidents
- Max buffer cap: 5.0

**Usage:**
```python
from app.risk_buffer import RiskBuffer
risk_buffer = RiskBuffer(redis_client)
buffer_value = risk_buffer.get_buffer(user_id)
risk_buffer.update_buffer(user_id, risk_score, action)
```

### 3. Dynamic Thresholds (`app/dynamic_thresholds.py`)

**Purpose:** Personalized risk thresholds adapting to user behavior.

**Factors:**
1. **Risk Buffer:** Lower thresholds as buffer increases
2. **Amount:** Higher amounts → stricter thresholds
3. **Account Age:** New accounts (<30 days) → stricter
4. **Time of Day:** Unusual hours (11 PM - 5 AM) → stricter
5. **Device Novelty:** New devices → stricter

**Formulas:**
```python
delay_threshold = max(0.20, base_delay - risk_buffer * 0.03)
block_threshold = max(0.35, base_block - max(0, risk_buffer - 1.0) * 0.05)
```

### 4. Drift Detector (`app/drift_detector.py`)

**Purpose:** Monitor feature distribution changes over time.

**PSI Calculation:**
```python
PSI = Σ (Actual% - Expected%) × ln(Actual% / Expected%)
```

**Thresholds:**
- PSI < 0.1: Stable
- 0.1 ≤ PSI < 0.25: Minor drift (monitor)
- PSI ≥ 0.25: Major drift (retrain model)

**API Endpoints:**
- `GET /api/drift-report` - Current drift status
- Baselines stored in Redis after model training

### 5. Graph Signals (`app/graph_signals.py`)

**Purpose:** Network-based fraud detection using transaction graph analysis.

**Metrics:**
1. **Fraud Ratio:** Percentage of senders to recipient who were blocked
2. **Centrality:** How well-connected a recipient is (higher = more suspicious)
3. **Shared Device Risk:** Multiple users on same device

**Graph Construction:**
- Nodes: Users, recipients, devices
- Edges: Transactions, device usage
- Updated in real-time

**Risk Calculation:**
```python
graph_risk = (fraud_ratio × 0.6) + (centrality × 0.3) + (device_risk × 0.1)
final_risk = 0.6 × ml_risk + 0.4 × graph_risk
```

## API Endpoints

### User Backend (Port 8001)

#### Transaction Processing
- `POST /api/transaction` - Create new transaction with ML evaluation
- `POST /api/transaction/confirm` - Confirm delayed transaction
- `POST /api/transaction/cancel` - Cancel delayed transaction

#### WebSocket
- `WS /ws/user/{user_id}` - Real-time transaction updates

### Admin Backend (Port 8000)

#### ML Monitoring
- `GET /api/drift-report` - Feature drift status
- `GET /api/risk-buffer/{user_id}` - User risk buffer value
- `GET /api/graph-profile/{recipient}` - Recipient fraud profile

#### Chatbot
- `POST /api/chatbot` - AI-powered fraud assistant

#### WebSocket
- `WS /ws` - Admin dashboard live updates

## Configuration

### Environment Variables
```bash
# Database
DB_URL=postgresql://fdt:fdtpass@127.0.0.1:5432/fdt_db

# Redis
REDIS_URL=redis://localhost:6379/0

# ML Models
MODEL_PATH=./models

# Groq API (for chatbot)
GROQ_API_KEY=your_key_here

# Thresholds (base values)
DELAY_THRESHOLD=0.25
BLOCK_THRESHOLD=0.40
```

### Redis Key Patterns
```
# Trust Engine
trust:{user_id}:{recipient}:{metric}

# Risk Buffer
risk_buffer:{user_id}:value
risk_buffer:{user_id}:last_ts
risk_buffer:{user_id}:history

# Drift Detection
drift:baseline:{feature_name}
drift:live:{feature_name}
drift:last_report

# Graph Signals
graph:recipient:{recipient}:senders
graph:recipient:{recipient}:fraud_senders
graph:device:{device}:users
graph:device:{device}:fraud_users
graph:user:{user_id}:recipients
graph:user:{user_id}:fraud_count
```

## Testing

### Unit Tests
```bash
cd /home/aakash/Projects/Fraud-Detection-in-UPI---FDT2
python3 -m pytest tests/ -v
```

### Integration Tests
```bash
# Start backends
python3 backend/server.py  # Port 8001
python3 -m uvicorn app.main:app --port 8000  # Port 8000

# Run tests
python3 tests/test_chatbot.py
python3 tests/test_full_integration.py
```

### Manual Testing
```bash
# Test transaction flow
curl -X POST http://localhost:8001/api/transaction \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount": 5000, "recipient_vpa": "test@upi"}'

# Check drift report
curl http://localhost:8000/api/drift-report

# Test chatbot
curl -X POST http://localhost:8000/api/chatbot \
  -d '{"message": "analyze fraud patterns"}'
```

## Performance Metrics

### Model Performance (Latest Training)
| Model | ROC-AUC | Precision | Recall | F1-Score |
|-------|---------|-----------|--------|----------|
| Isolation Forest | 0.9581 | 0.77 | 0.82 | 0.79 |
| Random Forest | 0.9884 | 0.83 | 0.88 | 0.85 |
| XGBoost | 0.9881 | 0.78 | 0.90 | 0.84 |

### System Performance
- Transaction processing: ~200ms average
- WebSocket latency: <50ms
- Model inference: ~50ms
- Redis operations: ~5ms

## Deployment

### Docker Setup
```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
```

### Production Checklist
- [ ] Set strong JWT_SECRET_KEY
- [ ] Configure PostgreSQL with SSL
- [ ] Enable Redis persistence
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure log aggregation
- [ ] Set up automated model retraining
- [ ] Enable rate limiting
- [ ] Configure backup strategies

## Troubleshooting

### Common Issues

**1. WebSocket Connection Failed**
```bash
# Check if backends are running
ps aux | grep -E "uvicorn|server.py"

# Check ports
netstat -tlnp | grep -E "8000|8001"
```

**2. Model Not Loading**
```bash
# Check model files exist
ls -lh models/*.joblib

# Retrain if needed
cd train && python3 train_models.py
```

**3. High Risk Buffer**
```bash
# Check user's risk buffer
redis-cli GET risk_buffer:{user_id}:value

# Clear if needed (for testing)
redis-cli DEL risk_buffer:{user_id}:value
```

**4. Drift Alerts**
```bash
# Check drift report
curl http://localhost:8000/api/drift-report

# Retrain models if major drift detected
cd train && python3 train_models.py
```

## Future Enhancements

### Planned Features
1. **Ensemble Weights Optimization** - Auto-tune model weights based on performance
2. **Online Learning** - Incremental model updates with new data
3. **Explainability Dashboard** - Visual explanations for fraud decisions
4. **Multi-language Support** - Chatbot in regional languages
5. **Mobile Push Notifications** - Real-time fraud alerts

### Research Areas
1. **Graph Neural Networks** - Advanced network fraud detection
2. **Federated Learning** - Privacy-preserving model training
3. **Behavioral Biometrics** - Keystroke/touch pattern analysis
4. **Anomaly Detection** - Unsupervised fraud pattern discovery

---

**Version:** 2.0  
**Last Updated:** 2026-02-15  
**Maintainer:** Development Team