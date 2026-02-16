# Pattern Mapper Implementation Summary

## Overview
Created a deterministic, explainable, and reusable mapping layer that converts ML feature values into fraud pattern categories.

## Components Created

### 1. `app/pattern_mapper.py` (New Module)
**Purpose**: Core pattern detection logic with explicit thresholds

**Pattern Categories**:
1. **Amount Anomaly**
   - High amounts: ≥50000 (critical), ≥20000 (high), ≥10000 (moderate)
   - Statistical deviation: ≥3.0x (high), ≥2.0x (moderate)
   - Relative to user mean: ≥2.5x average

2. **Behavioural Anomaly**
   - Temporal: Night activity, weekend transactions
   - Merchant risk: ≥0.7 (high), ≥0.4 (moderate)
   - New recipient, risky channels (QR/Web)
   - Isolation Forest score ≥0.6

3. **Device Anomaly**
   - New/unseen device
   - First transaction from device

4. **Velocity Anomaly**
   - 1-minute: >3 critical, >2 warning
   - 5-minute: >10 critical, >5 warning
   - 1-hour: >30 critical, >15 warning
   - 6-hour: >50 warning

5. **Model Consensus**
   - All models ≥0.6
   - Average ≥0.7 with spread <0.2

6. **Model Disagreement**
   - Model score spread ≥0.3

**Key Features**:
- Dataclass-based `PatternResult` with confidence, triggers, explanation
- `PatternMapper` class with static methods for each pattern
- `analyze_all_patterns()` returns all 6 pattern results
- `get_pattern_summary()` provides API-ready summary with counts
- All thresholds configurable via `THRESHOLDS` dict
- Standalone test mode with sample data

### 2. Backend Integration (`app/main.py`)

**Transaction Processing**:
```python
# In /transactions endpoint
pattern_summary = PatternMapper.get_pattern_summary(features, model_scores)
tx["explainability"] = {
    "reasons": [...],
    "model_scores": {...},
    "features": {...},
    "patterns": pattern_summary  # NEW
}
```

**New Endpoint** `/pattern-analytics`:
- Aggregates pattern counts across transactions for time_range
- Server-side computation for consistency
- Returns: `{ amount_anomaly: count, behavioural_anomaly: count, ... }`

### 3. Dashboard Updates (`static/dashboard.js`)

**Pattern Consumption Priority**:
1. **First**: Use pre-computed `tx.explainability.patterns.pattern_counts` (backend-generated)
2. **Second**: Compute from features using same thresholds as backend
3. **Third**: Fallback to reason text parsing (legacy/older transactions)

**Fraud Pattern Chart**:
- Now uses deterministic feature-based logic
- Matches backend `PatternMapper` thresholds exactly
- No more arbitrary counters ("3 to same recipient", etc.)
- Real ML signals drive every bar

## Benefits Achieved

✅ **Deterministic**: Same features always produce same patterns  
✅ **Explainable**: Every threshold documented with clear rules  
✅ **Reusable**: Single source of truth in `pattern_mapper.py`  
✅ **Consistent**: Backend and frontend use identical logic  
✅ **No Duplication**: Features computed once, patterns derived from them  
✅ **No Fake Analytics**: Patterns reflect actual ML feature signals  
✅ **Auditable**: Pattern analysis persisted in database JSONB  

## Usage

### Backend (Python)
```python
from app.pattern_mapper import PatternMapper

features = extract_features(tx)  # From feature_engine
model_scores = score_with_ensemble(features)  # From scoring

patterns = PatternMapper.analyze_all_patterns(features, model_scores)
summary = PatternMapper.get_pattern_summary(features, model_scores)

# Returns:
# {
#   "pattern_counts": {"amount_anomaly": 1, ...},
#   "detected_patterns": [{"name": "...", "confidence": 0.85, ...}],
#   "total_detected": 3
# }
```

### Frontend (JavaScript)
```javascript
// Pre-computed patterns (preferred)
const patterns = tx.explainability?.patterns?.pattern_counts;
amountAnomaly += patterns.amount_anomaly || 0;

// Or compute from features (fallback)
const f = tx.explainability?.features;
if (f.amount >= 50000 || f.amount_deviation >= 3.0) amountAnomaly++;
```

### API Endpoints
```bash
# Get pattern aggregates for dashboard
GET /pattern-analytics?time_range=24h

# Response:
{
  "amount_anomaly": 45,
  "behavioural_anomaly": 67,
  "device_anomaly": 23,
  "velocity_anomaly": 12,
  "model_consensus": 34,
  "model_disagreement": 8
}
```

## Testing

Run standalone test:
```bash
python app/pattern_mapper.py
```

Verify integration:
```bash
python tools/verify_pattern_mapper.py
python tools/create_test_transaction.py
```

Check database:
```sql
SELECT explainability->'patterns'->'pattern_counts' 
FROM transactions 
WHERE explainability IS NOT NULL 
LIMIT 5;
```

## Configuration

Edit thresholds in `app/pattern_mapper.py`:
```python
THRESHOLDS = {
    "amount_high": 10000,           # Adjust for your currency
    "velocity_1min_critical": 3,    # Card testing threshold
    "model_consensus_min": 0.6,     # Model agreement floor
    ...
}
```

## Migration Notes

- **Existing transactions**: Pattern analysis added going forward
- **Old transactions**: Dashboard falls back to feature-based or reason-text computation
- **No schema changes**: Uses existing `explainability` JSONB column
- **Backward compatible**: All old code paths still work

## File Structure
```
app/
  pattern_mapper.py          # NEW - Core mapping logic
  main.py                    # MODIFIED - Integration + endpoint
  scoring.py                 # (unchanged)
  feature_engine.py          # (unchanged)
  explainability.py          # (unchanged)

static/
  dashboard.js               # MODIFIED - Pattern consumption

tools/
  verify_pattern_mapper.py   # NEW - Verification script
```

## Next Steps (Optional)

1. **Tune thresholds** based on production data distribution
2. **Add pattern trends** over time (e.g., velocity increasing)
3. **Pattern correlation analysis** (which patterns co-occur)
4. **Custom pattern rules** per merchant category or user segment
5. **A/B test** pattern visibility impact on admin decision quality
