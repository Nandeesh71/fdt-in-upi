# Fraud Pattern Analysis: Technical Explanation

## Overview
The UPI Fraud Detection System derives fraud patterns through a deterministic mapping layer that converts ML features and ensemble model outputs into human-readable pattern categories. This approach provides both accurate detection and explainable insights.

---

## Architecture Flow

```
Transaction → Feature Extraction → Ensemble Models → Pattern Mapper → Dashboard/Alerts
```

### 1. Feature Extraction
Each transaction undergoes comprehensive feature engineering via `feature_engine.py`:

**Temporal Features:**
- `hour_of_day`, `is_night` (22:00-05:00), `is_weekend`
- Business hours classification

**Velocity Features (Redis-backed):**
- `tx_count_1min`, `tx_count_5min`, `tx_count_1h`, `tx_count_6h`
- Real-time transaction frequency tracking

**Behavioral Features:**
- `is_new_recipient`, `is_new_device`, `device_count`
- `is_round_amount` (testing pattern indicator)

**Statistical Features:**
- `amount_mean`, `amount_std`, `amount_deviation`
- User-specific spending patterns

**Risk Signals:**
- `merchant_risk_score`, `is_qr_channel`, `is_web_channel`

---

## 2. Ensemble Model Scoring

Three complementary models produce independent risk assessments:

### Isolation Forest (20% weight)
- **Type:** Unsupervised anomaly detection
- **Purpose:** Identifies unusual patterns not seen in training
- **Output:** Anomaly score (0-1, higher = more anomalous)
- **Strength:** Detects novel fraud patterns

### Random Forest (40% weight)
- **Type:** Supervised classification
- **Purpose:** Learns from historical labeled fraud cases
- **Output:** Fraud probability (0-1)
- **Strength:** Recognizes known fraud signatures

### XGBoost (40% weight)
- **Type:** Supervised classification (gradient boosting)
- **Purpose:** Captures complex feature interactions
- **Output:** Fraud probability (0-1)
- **Strength:** High accuracy on complex patterns

### Ensemble Voting
Final risk score = `0.2 × iforest + 0.4 × random_forest + 0.4 × xgboost`

---

## 3. Pattern Mapper: Deterministic Rule Layer

The `PatternMapper` class (`app/pattern_mapper.py`) translates features and model scores into six fraud pattern categories using explicit, configurable thresholds.

### Pattern Categories

#### A. Amount Anomaly
**Triggers:**
- Amount ≥ ₹50,000 (critical)
- Amount ≥ ₹20,000 (high)
- Amount ≥ ₹10,000 (moderate)
- `amount_deviation` ≥ 3.0 (statistical outlier)
- Amount ≥ 2.5× user's average

**Example:**
```
Transaction: ₹45,000 (user average: ₹5,000)
→ Detected: deviation = 9.0, triggers "Amount Anomaly"
```

#### B. Behavioural Anomaly
**Triggers:**
- Night transaction (22:00-05:00)
- Weekend activity
- Round amount (₹1000, ₹5000 - testing pattern)
- Merchant risk score ≥ 0.4
- New recipient
- Risky channel (QR, Web)
- Isolation Forest score ≥ 0.6 (unsupervised anomaly)

**Example:**
```
Transaction at 02:30, ₹2000, new recipient
→ Detected: is_night=1, is_new_recipient=1, is_round_amount=1
→ Confidence: 0.70
```

#### C. Device Anomaly
**Triggers:**
- `is_new_device` = 1
- `device_count` ≤ 1 (first transaction from device)

**Example:**
```
Device ID never seen before
→ Detected: "New/unseen device"
→ Confidence: 0.75
```

#### D. Velocity Anomaly
**Triggers:**
- 1 minute: >3 transactions (critical), >2 (warning)
- 5 minutes: >10 transactions (critical), >5 (warning)
- 1 hour: >30 transactions (critical), >15 (warning)
- 6 hours: >50 transactions (warning)

**Example:**
```
User makes 12 transactions in 5 minutes
→ Detected: "Velocity Anomaly - 12 transactions in 5 minutes"
→ Confidence: 0.90 (card testing suspected)
```

#### E. Model Consensus
**Advanced Ensemble Behavior:**

**Strong Fraud Signal:**
- All models ≥ 0.6: "All models agree: high risk"
- Average ≥ 0.7 with spread < 0.2: "Models consensus"

**Known Fraud Pattern:**
- Supervised models (RF + XGBoost) high, Isolation Forest low
- Indicates fraud matching historical patterns

**Example:**
```
Isolation Forest: 0.35
Random Forest: 0.82
XGBoost: 0.78
→ Detected: "Known fraud pattern: tree-based models high while anomaly model is low"
→ Confidence: 0.80
```

#### F. Model Disagreement
**Triggers:**
- Model score spread ≥ 0.3

**Behavioural Risk Signal:**
- Isolation Forest high, supervised models low
- Novel pattern not in training data

**Example:**
```
Isolation Forest: 0.85
Random Forest: 0.35
XGBoost: 0.40
→ Detected: "Behavioural risk: anomaly model high while supervised models are low"
→ Confidence: 0.72
```

---

## 4. Pattern Aggregation for Dashboard

### Backend Aggregation
The `/pattern-analytics` endpoint (`app/main.py::db_aggregate_fraud_patterns`) computes pattern statistics:

```python
# For each transaction with explainability data:
1. Check for pre-computed patterns in explainability.patterns
2. If not available, compute on-the-fly using PatternMapper
3. One transaction can contribute to multiple patterns
4. Aggregate counts across time window (1h/24h/7d/30d)
```

**Query Example:**
```
GET /pattern-analytics?time_range=24h
→ Returns: {
  "amount_anomaly": 45,
  "behavioural_anomaly": 67,
  "device_anomaly": 23,
  "velocity_anomaly": 12,
  "model_consensus": 34,
  "model_disagreement": 8,
  "transactions_analyzed": 824
}
```

### Frontend Visualization
The dashboard (`static/dashboard.js`) fetches real-time aggregated pattern counts:

- **Primary Source:** Backend API `/pattern-analytics`
- **Update Frequency:** 30-second intervals + WebSocket triggers
- **Chart Type:** Horizontal bar chart (Chart.js)
- **Real-time Updates:** Debounced WebSocket events (500ms)

---

## 5. Explainability Integration

### Pattern-Aligned Reasons
When transactions are scored, pattern explanations are merged into explainability reasons:

```javascript
// Backend: app/main.py
pattern_reasons = [
  "Amount Anomaly: Very high amount ₹45,000",
  "Behavioural Anomaly: Night transaction (02:00); New recipient",
  "Model Consensus: Strong fraud signal (min=0.78)"
]

tx["explainability"] = {
  "reasons": base_reasons + pattern_reasons,  // Merged, deduplicated
  "pattern_reasons": pattern_reasons,
  "model_scores": {...},
  "features": {...},
  "patterns": pattern_summary
}
```

### Admin Console Display
Explainability modal shows:
- **Reasons:** Merged list including pattern-driven explanations
- **Model Scores:** Individual model outputs (iforest, RF, XGBoost, ensemble)
- **Patterns:** Detected patterns with confidence and triggers

### User Dashboard
Simplified reasons hide internal model details:
- "Transaction blocked for security reasons" (BLOCK)
- "Transaction delayed due to unusual activity" (DELAY)
- "Transaction processed successfully" (ALLOW)

---

## 6. Key Design Principles

### Deterministic Mapping
- **Same inputs → Same outputs:** No randomness in pattern detection
- **Explicit thresholds:** All rules documented in `PatternMapper.THRESHOLDS`
- **Auditable:** Every pattern detection includes trigger features and explanations

### Multi-Pattern Detection
- Transactions can trigger multiple patterns simultaneously
- Example: High amount + night time + new device = 3 patterns

### Ensemble Awareness
- Pattern detection leverages ensemble behavior (consensus, disagreement)
- Distinguishes between known fraud (supervised) and novel patterns (unsupervised)

### Real-Time Performance
- Feature extraction: ~5ms (Redis-backed velocity)
- Model inference: ~15ms (ensemble)
- Pattern mapping: <1ms (deterministic rules)
- **Total latency:** ~20-25ms per transaction

---

## 7. Validation & Testing

### Pattern Mapper Validation
Test script: `tools/test_pattern_aggregation.py`

Sample output:
```
24h window: 824 transactions analyzed
  • Behavioural Anomaly: 67 detections
  • Device Anomaly: 23 detections
  • Model Disagreement: 8 detections
Total: 98 pattern detections
```

### Live Traffic Testing
Simulator generates diverse patterns:
- **Normal:** 60% (small amounts, known devices)
- **Suspicious:** 20% (large amounts, new devices)
- **High Risk:** 10% (very large, night time, new device)
- **Burst:** 10% (rapid transactions, velocity testing)

---

## 8. Benefits

### For Detection
- **Accuracy:** Ensemble combines multiple detection strategies
- **Coverage:** Catches both known patterns (supervised) and novel fraud (unsupervised)
- **Speed:** Real-time inference with <25ms latency

### For Explainability
- **Transparency:** Every decision backed by specific features and thresholds
- **Actionability:** Patterns guide investigation priorities
- **Compliance:** Auditable decision trail for regulatory requirements

### For Operations
- **Scalability:** Pattern aggregation handles thousands of transactions
- **Maintainability:** Configurable thresholds without model retraining
- **Monitoring:** Real-time pattern trends identify emerging fraud vectors

---

## Summary

The fraud pattern analysis system achieves both accuracy and explainability by:

1. **Extracting comprehensive features** from transaction data
2. **Using ensemble models** to capture diverse fraud signals
3. **Mapping features and scores** to human-readable patterns via deterministic rules
4. **Aggregating patterns** across transactions for trend analysis
5. **Integrating explanations** into admin and user-facing interfaces

This architecture provides fraud teams with actionable insights while maintaining the precision of ML-based detection.

---

## References

- **Pattern Mapper:** `app/pattern_mapper.py`
- **Feature Engine:** `app/feature_engine.py`
- **Ensemble Scoring:** `app/scoring.py`
- **Explainability:** `app/explainability.py`
- **API Endpoint:** `app/main.py::pattern_analytics`
- **Dashboard:** `static/dashboard.js`
