# 27 ML Features for Fraud Detection

The FDT system uses 27 features across 6 categories to predict whether a UPI transaction is fraudulent. Features are ranked by importance from the XGBoost model.

## Feature Importance Rankings

### Top 15 Most Important Features

| Rank | Feature | Importance | Category |
|------|---------|------------|----------|
| 1 | `log_amount` | 0.2548 | Basic |
| 2 | `amount` | 0.2363 | Basic |
| 3 | `amount_std` | 0.2073 | Statistical |
| 4 | `is_round_amount` | 0.0459 | Basic |
| 5 | `merchant_risk_score` | 0.0422 | Risk |
| 6 | `amount_mean` | 0.0343 | Statistical |
| 7 | `is_night` | 0.0240 | Temporal |
| 8 | `is_qr_channel` | 0.0207 | Risk |
| 9 | `is_new_device` | 0.0177 | Behavioral |
| 10 | `hour_of_day` | 0.0171 | Temporal |
| 11 | `recipient_tx_count` | 0.0147 | Behavioral |
| 12 | `amount_deviation` | 0.0146 | Statistical |
| 13 | `device_count` | 0.0146 | Behavioral |
| 14 | `is_web_channel` | 0.0143 | Risk |
| 15 | `is_business_hours` | 0.0125 | Temporal |

---

## All 27 Features by Category

### 1. Basic Transaction Features (3)
- **`amount`** - Raw transaction amount in rupees
- **`log_amount`** - Log-transformed amount for better distribution
- **`is_round_amount`** - Binary: amount is multiple of 100 or 500 (suspicious if true)

### 2. Temporal Features (6)
- **`hour_of_day`** - Hour when transaction occurred (0-23)
- **`month_of_year`** - Month of transaction (1-12)
- **`day_of_week`** - Day of week (0=Monday, 6=Sunday)
- **`is_weekend`** - Binary: transaction on weekend
- **`is_night`** - Binary: transaction between 22:00-05:00
- **`is_business_hours`** - Binary: transaction between 09:00-17:00

### 3. Velocity Features (5)
- **`tx_count_1min`** - Number of transactions in last minute
- **`tx_count_5min`** - Number of transactions in last 5 minutes
- **`tx_count_1h`** - Number of transactions in last hour
- **`tx_count_6h`** - Number of transactions in last 6 hours
- **`tx_count_24h`** - Number of transactions in last 24 hours

### 4. Behavioral Features (6)
- **`is_new_recipient`** - Binary: first time sending to this recipient
- **`recipient_tx_count`** - Total transactions with this recipient
- **`is_new_device`** - Binary: first transaction from this device
- **`device_count`** - Total unique devices used by user
- **`is_p2p`** - Binary: Person-to-Person transaction
- **`is_p2m`** - Binary: Person-to-Merchant transaction

### 5. Statistical Features (4)
- **`amount_mean`** - User's average transaction amount
- **`amount_std`** - Standard deviation of user's amounts
- **`amount_max`** - User's maximum transaction amount
- **`amount_deviation`** - How much current amount deviates from user's average

### 6. Risk Features (3)
- **`merchant_risk_score`** - Calculated risk score for merchant (0-1)
- **`is_qr_channel`** - Binary: transaction via QR code
- **`is_web_channel`** - Binary: transaction via web platform

---

## Key Insights

### Dominant Feature Groups
1. **Amount-based features** are the most predictive (top 3 features)
   - Transaction amount patterns reveal significant fraud indicators
   
2. **Statistical features** (std, mean, deviation) are highly important
   - Deviation from user's normal behavior is a strong fraud signal

3. **Temporal patterns** are moderately important
   - Unusual timing (night hours, off-hours) increases fraud risk

4. **Behavioral patterns** have lower but meaningful importance
   - New recipients/devices and transaction velocity matter

### Model Performance
- **Training Samples:** 7,700
- **Test Samples:** 3,300
- **Fraud Rate:** 9.09%
- **XGBoost ROC-AUC:** 0.988 (98.8% accuracy)
- **Random Forest ROC-AUC:** 0.989 (98.9% accuracy)

---

## Feature Usage in Code

Features are extracted in `app/feature_engine.py` and used by three ensemble models:
- **Random Forest** - Best overall performance
- **XGBoost** - Balanced precision/recall
- **Isolation Forest** - Anomaly detection

The ensemble combines all three for final fraud score prediction.
