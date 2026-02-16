# Detailed Explanation of All 27 Fraud Detection Features

---

## BASIC TRANSACTION FEATURES (3 features)

### 1. **amount**
- **Type:** Continuous (Float)
- **Range:** 0 - unlimited (in rupees)
- **Importance Score:** 0.2363 (2nd most important)
- **What it measures:** The raw transaction amount in Indian rupees
- **Why it matters for fraud detection:**
  - Fraudsters often use specific amounts (round numbers, large amounts)
  - High amounts increase fraud risk and incentive for attackers
  - Pattern: Large round amounts are more suspicious than irregular amounts
- **Example values:**
  - Legitimate: ₹523, ₹1,847, ₹5,234
  - Suspicious: ₹50,000, ₹10,000 (round amounts)
- **Model insight:** Combined with log_amount and amount_std, forms the top 3 predictive features

---

### 2. **log_amount**
- **Type:** Continuous (Float)
- **Calculation:** log(1 + amount)
- **Importance Score:** 0.2548 (MOST IMPORTANT - Rank #1)
- **What it measures:** Logarithmic transformation of transaction amount
- **Why it matters for fraud detection:**
  - Log transformation normalizes skewed distributions
  - Makes extreme values less dominant
  - Helps model learn non-linear relationships with amount
  - Typical fraud amounts follow a distribution better captured by log scale
- **Example transformation:**
  - amount=100 → log_amount=4.61
  - amount=10,000 → log_amount=9.21
  - amount=50,000 → log_amount=10.82
- **Model insight:** Single most important feature across all models

---

### 3. **is_round_amount**
- **Type:** Binary (0 or 1)
- **Values:** 
  - 1.0 = amount is multiple of 100 or 500
  - 0.0 = amount is not round
- **Importance Score:** 0.0459 (Rank #4)
- **What it measures:** Whether transaction amount is "suspiciously round"
- **Why it matters for fraud detection:**
  - Legitimate users often use realistic amounts (₹523, ₹1,847)
  - Fraudsters frequently use round amounts for simplicity
  - Phishing/scam patterns show preference for multiples of 100/500
  - Round amounts are easier to remember and communicate
- **Example:**
  - is_round_amount = 1.0 for: ₹500, ₹1,000, ₹5,000, ₹50,000
  - is_round_amount = 0.0 for: ₹523, ₹1,847, ₹5,234
- **Fraud indicator:** Strong indicator when combined with new device/recipient

---

## TEMPORAL FEATURES (6 features)

### 4. **hour_of_day**
- **Type:** Continuous (0-23)
- **Range:** 0 (midnight) to 23 (11 PM)
- **Importance Score:** 0.0171 (Rank #10)
- **What it measures:** Hour when the transaction was executed
- **Why it matters for fraud detection:**
  - Users have behavioral patterns (work hours vs. off-hours)
  - Fraudsters may not know victim's timezone or schedule
  - Night transactions are inherently more suspicious (see `is_night`)
  - Business transactions happen during specific hours
- **Example patterns:**
  - Legitimate user: Usually transacts 09:00-21:00
  - Fraudulent: Sudden transaction at 03:00 (unusual)
- **Fraud indicator:** Hour 2-5 AM has higher fraud rate

---

### 5. **month_of_year**
- **Type:** Continuous (1-12)
- **Range:** 1 (January) to 12 (December)
- **Importance Score:** Not in top 15 (relatively low)
- **What it measures:** Calendar month of transaction
- **Why it matters for fraud detection:**
  - Seasonal patterns in spending (festivals, holidays in India)
  - Diwali (Oct-Nov): Higher legitimate spending, but also fraud attempts
  - Year-end (Dec): Shopping season, increased fraud risk
  - Fiscal year patterns may affect business transactions
- **Example patterns:**
  - October-November (Diwali): Expected high spending, baseline increases
  - December: Year-end purchases, gift-giving, higher fraud attempts
  - March-April: Tax season, unusual patterns possible
- **Fraud indicator:** Unexpected spending pattern for a given month

---

### 6. **day_of_week**
- **Type:** Continuous (0-6)
- **Range:** 0 (Monday) to 6 (Sunday)
- **Importance Score:** Not in top 15
- **What it measures:** Day of the week when transaction occurred
- **Why it matters for fraud detection:**
  - Different spending patterns on weekdays vs. weekends
  - Weekday transactions align with work schedules
  - Weekend transactions may be shopping/entertainment related
  - Fraudsters might not have knowledge of user's weekly pattern
- **Example patterns:**
  - Weekday (Mon-Fri): Work-related payments, bills, regular expenses
  - Weekend (Sat-Sun): Shopping, entertainment, leisure spending
  - Anomaly: Regular Mon-Fri transactor suddenly active on Sunday 3 AM
- **Fraud indicator:** Transaction pattern inconsistent with user's historical day preferences

---

### 7. **is_weekend**
- **Type:** Binary (0 or 1)
- **Values:**
  - 1.0 = Saturday or Sunday
  - 0.0 = Monday to Friday
- **Importance Score:** Not in top 15
- **What it measures:** Whether transaction occurred on weekend
- **Why it matters for fraud detection:**
  - Weekend behavior differs from weekday behavior
  - Some frauds exploit weekends when customer support is limited
  - Weekend transactions may be delayed in processing
  - Combined with hour can identify unusual patterns
- **Example:**
  - Weekend + Night + New Device = high fraud risk
  - Weekend + Business Hours + Regular Device = low fraud risk
- **Fraud indicator:** Weekend + unusual hour + new device = suspicious

---

### 8. **is_night**
- **Type:** Binary (0 or 1)
- **Definition:** 1.0 if hour is 22-23 or 0-5, else 0.0
- **Importance Score:** 0.0240 (Rank #7)
- **What it measures:** Whether transaction occurred during night hours (10 PM - 5 AM)
- **Why it matters for fraud detection:**
  - Most legitimate users don't transact at 3 AM
  - Fraudsters and scammers operate during low-awareness hours
  - Night transactions are statistically more likely to be fraudulent
  - User behavior patterns usually exclude late night UPI usage
- **Example:**
  - Night=1.0 for: 22:00, 23:15, 01:30, 03:45, 04:59
  - Night=0.0 for: 08:00, 14:30, 17:45, 20:30
- **Fraud indicator:** Very strong indicator when combined with other high-risk features

---

### 9. **is_business_hours**
- **Type:** Binary (0 or 1)
- **Definition:** 1.0 if hour is 09:00-17:00, else 0.0
- **Importance Score:** 0.0125 (Rank #15)
- **What it measures:** Whether transaction occurred during standard business hours
- **Why it matters for fraud detection:**
  - Business hours transactions are typically more legitimate
  - Work-related payments happen during office hours
  - Absence of business hours transactions is suspicious for merchants
  - Combined with other features defines user behavior baseline
- **Example:**
  - Business hours = 1.0 for: 09:00-17:00 (includes end of business)
  - Business hours = 0.0 for: 08:30, 17:30, 21:00, 03:00
- **Fraud indicator:** Low fraud rate during business hours; absence of business hour transactions from merchant is suspicious

---

## VELOCITY FEATURES (5 features)

### 10. **tx_count_1min**
- **Type:** Continuous (0+)
- **Meaning:** Number of transactions in last 1 minute
- **Importance Score:** Not in top 15 (but important for anomalies)
- **What it measures:** Immediate transaction velocity
- **Why it matters for fraud detection:**
  - Normal users: 0-1 transactions per minute
  - Fraud/Automated bot: Multiple transactions in seconds
  - Indicates compromised account or bot attack
  - First signal of account takeover (rapid-fire attempts)
- **Example values:**
  - Legitimate: 0 or 1
  - Suspicious: 5+ (indicates bot sending multiple rapid payments)
  - Critical: 10+ (almost certainly fraudulent bot activity)
- **Fraud indicator:** >3 transactions in 1 minute is very suspicious

---

### 11. **tx_count_5min**
- **Type:** Continuous (0+)
- **Meaning:** Number of transactions in last 5 minutes
- **Importance Score:** Not in top 15
- **What it measures:** Short-term transaction velocity (5-minute window)
- **Why it matters for fraud detection:**
  - Catches rapid multi-recipient fraud attempts
  - Normal users: 0-3 transactions in 5 minutes (rare)
  - Fraudsters: Often send to multiple recipients in quick succession
  - Money laundering pattern: Rapid distribution from one account
- **Example values:**
  - Legitimate: 0-2
  - Suspicious: 4-6 (unusual burst of activity)
  - Critical: 8+ (bot or rapid money transfer attempt)
- **Fraud indicator:** Sudden spike in 5-min transactions indicates account compromise

---

### 12. **tx_count_1h**
- **Type:** Continuous (0+)
- **Meaning:** Number of transactions in last 1 hour
- **Importance Score:** Not in top 15 (but moderately important)
- **What it measures:** Medium-term velocity (1-hour window)
- **Why it matters for fraud detection:**
  - Shows sustained fraud activity vs. one-off anomaly
  - Normal active user: 2-5 transactions per hour
  - Fraudster: Often 10+ transactions trying different recipients/amounts
  - Identifies compromised accounts being drained
- **Example values:**
  - Legitimate active user: 3-7
  - Suspicious: 10-15 (unusual but possible)
  - Critical: 20+ (very likely fraud or bot attack)
- **Fraud indicator:** Sudden increase in hourly transaction rate

---

### 13. **tx_count_6h**
- **Type:** Continuous (0+)
- **Meaning:** Number of transactions in last 6 hours
- **Importance Score:** Not in top 15
- **What it measures:** Medium-long term velocity (6-hour window)
- **Why it matters for fraud detection:**
  - Identifies sustained fraud activity over a work shift
  - Shows whether spike is isolated or prolonged
  - Normal user: 5-20 transactions in 6 hours
  - Fraudster: May show abnormal clustering in specific 6-hour window
  - Helps distinguish from normal peak-hour usage
- **Example values:**
  - Legitimate: 8-25
  - Suspicious: 40+ (unusual sustained activity)
  - Critical: 60+ (account definitely compromised)
- **Fraud indicator:** Unusual 6-hour pattern compared to user's baseline

---

### 14. **tx_count_24h**
- **Type:** Continuous (0+)
- **Meaning:** Number of transactions in last 24 hours
- **Importance Score:** Not in top 15
- **What it measures:** Long-term daily velocity
- **Why it matters for fraud detection:**
  - Establishes daily baseline for the user
  - Detects abnormal daily activity patterns
  - Normal user: 5-50 transactions per day (varies widely)
  - Fraudster: Sudden spike in daily count vs. historical average
- **Example values:**
  - Light user: 2-10 per day
  - Moderate user: 10-30 per day
  - Heavy user: 30-100+ per day
  - Fraud spike: 5x normal daily count
- **Fraud indicator:** Deviation from user's historical daily average

---

## BEHAVIORAL FEATURES (6 features)

### 15. **is_new_recipient**
- **Type:** Binary (0 or 1)
- **Values:**
  - 1.0 = First time sending to this recipient
  - 0.0 = Recipient seen before
- **Importance Score:** Not in top 15 (but important for fraud patterns)
- **What it measures:** Whether this is first transaction to this specific recipient
- **Why it matters for fraud detection:**
  - Fraudsters target new recipients
  - Creates new trails that victim didn't initiate
  - First transaction to recipient is inherently risky
  - Combined with amount and device = strong fraud signal
  - Money laundering often involves new recipients
- **Example:**
  - new_recipient=1.0 for first transaction to someone
  - new_recipient=0.0 for recurring payments to same person (bill, salary, family)
- **Fraud indicator:** New recipient + high amount + new device = very high risk
- **Legitimate exception:** Users do add new recipients; combined with other factors

---

### 16. **recipient_tx_count**
- **Type:** Continuous (0+)
- **Meaning:** Total number of transactions to this specific recipient
- **Importance Score:** 0.0147 (Rank #11)
- **What it measures:** Transaction history with this particular recipient
- **Why it matters for fraud detection:**
  - Established recipients have higher trust score
  - New recipients (count=1) are inherently higher risk
  - Regular recipients (count=10+) indicate established relationship
  - Fraudsters tend to target new recipients or random addresses
  - Pattern: Compromised account sends to unknown recipients
- **Example values:**
  - recipient_tx_count=1 (new, suspicious)
  - recipient_tx_count=15 (established, trusted)
  - recipient_tx_count=50+ (regular payment like salary/rent)
- **Fraud indicator:** Low count + high amount + new device = red flag

---

### 17. **is_new_device**
- **Type:** Binary (0 or 1)
- **Values:**
  - 1.0 = First transaction from this device
  - 0.0 = Device seen before
- **Importance Score:** 0.0177 (Rank #9)
- **What it measures:** Whether transaction originated from a new/unseen device
- **Why it matters for fraud detection:**
  - Account takeover requires different device (attacker's phone)
  - New device + high amount = very suspicious
  - Compromised account typically shows new device transactions
  - Legitimate new devices need context (new phone, tablet)
  - Device fingerprinting is strong fraud indicator
- **Example:**
  - new_device=1.0 when transaction from new IMEI/phone detected
  - new_device=0.0 for regular transactions from usual device
- **Fraud indicator:** New device + night + high amount + new recipient = critical
- **Legitimate exception:** User can buy new phone, but pattern should stabilize

---

### 18. **device_count**
- **Type:** Continuous (0+)
- **Meaning:** Total number of unique devices used by this user
- **Importance Score:** 0.0146 (Rank #13)
- **What it measures:** Cumulative count of different devices ever used
- **Why it matters for fraud detection:**
  - Normal users: 1-3 devices (phone, maybe tablet, maybe old phone)
  - Suspicious: 10+ devices (account used from multiple locations/attackers)
  - Helps identify if new device is anomaly or pattern
  - High device count + new device = compromised indicator
  - Geolocation variance across devices indicates account takeover
- **Example values:**
  - device_count=1 (single phone user)
  - device_count=3 (phone + tablet + work device - normal)
  - device_count=10+ (possibly compromised)
- **Fraud indicator:** Sudden increase in device_count + new device = account takeover signal

---

### 19. **is_p2p**
- **Type:** Binary (0 or 1)
- **Values:**
  - 1.0 = Person-to-Person transaction
  - 0.0 = Not P2P (merchant payment or other)
- **Importance Score:** Not in top 15
- **What it measures:** Transaction type classification
- **Why it matters for fraud detection:**
  - P2P to unknown recipients is higher fraud risk
  - P2P transactions are harder to dispute/reverse
  - Scammers prefer P2P (feels personal, hard to trace)
  - Merchant transactions have buyer protection (usually)
  - P2P + new recipient + night = fraud pattern
- **Example:**
  - is_p2p=1.0 for: Mobile transfers, family payments, splitting bills
  - is_p2p=0.0 for: Shop payments, bill payments, subscription
- **Fraud indicator:** P2P + new recipient + unusual time = suspicious

---

### 20. **is_p2m**
- **Type:** Binary (0 or 1)
- **Values:**
  - 1.0 = Person-to-Merchant transaction
  - 0.0 = Not P2M (P2P or other)
- **Importance Score:** Not in top 15
- **What it measures:** Transaction type classification (merchant payment)
- **Why it matters for fraud detection:**
  - P2M transactions are generally lower fraud risk
  - Merchants have established accounts and verification
  - Merchants are identifiable and traceable
  - P2M usually involves merchant app (adds friction)
  - New merchant + high amount = still suspicious
- **Example:**
  - is_p2m=1.0 for: Swiggy, Zomato, Flipkart, grocery stores
  - is_p2m=0.0 for: Personal transfers, bill splits
- **Fraud indicator:** Even P2M can be fraud if new merchant + high amount

---

## STATISTICAL FEATURES (4 features)

### 21. **amount_mean**
- **Type:** Continuous (Float)
- **Meaning:** Average transaction amount for this user (historical)
- **Importance Score:** 0.0343 (Rank #6)
- **What it measures:** User's typical transaction size
- **Why it matters for fraud detection:**
  - Establishes user's baseline spending pattern
  - Sudden deviation indicates anomaly
  - User spending profiles are remarkably consistent
  - Example: User normally sends ₹500, suddenly sends ₹50,000
  - Fraudsters don't know user's typical amount
- **Example values:**
  - amount_mean=2,000 (user usually sends ~2k)
  - Suspicious: Current transaction = ₹50,000 (25x normal)
- **Fraud indicator:** Current amount >> amount_mean indicates anomaly

---

### 22. **amount_std**
- **Type:** Continuous (Float)
- **Meaning:** Standard deviation of user's transaction amounts
- **Importance Score:** 0.2073 (Rank #3 - VERY IMPORTANT)
- **What it measures:** Variability/consistency in user's spending
- **Why it matters for fraud detection:**
  - Consistent user (low std): ₹1,000-₹2,500 range → std=500
  - Highly variable user (high std): ₹100 to ₹50,000 → std=15,000
  - Low std user = predictable patterns, anomalies more obvious
  - High std user = harder to detect fraud (more variation expected)
  - Standard deviation reveals spending discipline/profile
- **Example:**
  - User A: std=200 (very consistent, new ₹1,000 tx is suspicious)
  - User B: std=5,000 (variable spender, new ₹1,000 tx is normal)
- **Fraud indicator:** Multiple standard deviations from mean = anomaly

---

### 23. **amount_max**
- **Type:** Continuous (Float)
- **Meaning:** Maximum transaction amount user has ever sent
- **Importance Score:** Not in top 15 (but contextually important)
- **What it measures:** Historical highest transaction value
- **Why it matters for fraud detection:**
  - Establishes user's spending ceiling
  - Transaction > amount_max is suspicious
  - Fraud often exceeds user's historical max
  - Example: User's max ever was ₹10,000, suddenly sends ₹50,000
  - Context: Legitimate max can increase (e.g., buying laptop)
- **Example values:**
  - amount_max=5,000 (user never spent more)
  - Suspicious: ₹15,000 (3x historical maximum)
- **Fraud indicator:** Current amount > 2x amount_max = anomalous

---

### 24. **amount_deviation**
- **Type:** Continuous (Float)
- **Calculation:** |current_amount - amount_mean| / amount_std (or similar)
- **Importance Score:** 0.0146 (Rank #12)
- **What it measures:** How far current transaction deviates from user's average
- **Why it matters for fraud detection:**
  - Standardized deviation metric (accounts for variability)
  - Combines multiple statistical signals
  - Deviation=2.5 means 2.5 standard deviations from mean
  - Normal transactions: deviation < 2.0
  - Fraud transactions: deviation > 3.0
  - More robust than simple difference (amount - amount_mean)
- **Example:**
  - User normal: mean=₹2,000, std=₹500
  - Current tx: ₹5,000
  - Deviation = (5000-2000)/500 = 6.0 (very high, suspicious)
- **Fraud indicator:** Deviation > 3.0 is strong fraud signal

---

## RISK FEATURES (3 features)

### 25. **merchant_risk_score**
- **Type:** Continuous (0.0 to 1.0)
- **Meaning:** Calculated risk score for the merchant/recipient
- **Importance Score:** 0.0422 (Rank #5)
- **What it measures:** Intrinsic riskiness of the recipient account
- **How it's calculated:**
  - +0.5 if merchant name starts with digit (e.g., "9XMOVIES")
  - +0.3 if merchant name is very short (<4 characters)
  - +0.2 if merchant name contains only 0s and 1s (e.g., "1001")
  - Capped at 1.0
- **Why it matters for fraud detection:**
  - Some merchants/VPAs are inherently suspicious
  - Scam recipients often use obfuscated names
  - Legitimate merchants have readable names (Zomato, Flipkart)
  - Combines heuristics to flag suspicious receiving accounts
- **Example:**
  - "swiggy" → score=0.0 (known legitimate)
  - "9xyz123" → score=0.5 (digits at start)
  - "12345" → score=0.5+0.3=0.8 (digit start + short)
- **Fraud indicator:** merchant_risk_score > 0.5 = suspicious recipient

---

### 26. **is_qr_channel**
- **Type:** Binary (0 or 1)
- **Values:**
  - 1.0 = Transaction initiated via QR code scan
  - 0.0 = Not via QR code
- **Importance Score:** 0.0207 (Rank #8)
- **What it measures:** Transaction channel classification
- **Why it matters for fraud detection:**
  - QR code transactions have different fraud pattern
  - In-store QR (shop) = lower fraud
  - Unknown QR codes = higher fraud (can be replaced with scam QR)
  - Phishing often uses fake QR codes
  - Pattern: Unexpected QR transaction is suspicious
- **Example:**
  - is_qr_channel=1.0 for: Shop QR payment, app QR scan
  - is_qr_channel=0.0 for: Manual UPI ID entry, phone number transfer
- **Fraud indicator:** QR + unknown merchant + unusual amount = suspicious
- **Context matters:** Store QR at known shop = low fraud; Unknown QR = high fraud

---

### 27. **is_web_channel**
- **Type:** Binary (0 or 1)
- **Values:**
  - 1.0 = Transaction initiated via web platform
  - 0.0 = Not via web (mobile app, in-store, etc.)
- **Importance Score:** 0.0143 (Rank #14)
- **What it measures:** Transaction platform classification
- **Why it matters for fraud detection:**
  - Web-initiated transactions have different risk profile
  - Web requires password entry (adds friction, but also phishing target)
  - Website payment could be compromised merchant site
  - Less common for individual users (more for B2B/corporates)
  - Pattern: Sudden web channel usage is anomalous
- **Example:**
  - is_web_channel=1.0 for: Payment gateway on shopping website
  - is_web_channel=0.0 for: Mobile app, NEFT/RTGS, UPI app
- **Fraud indicator:** Unusual web transaction from typical app-user = suspicious
- **Context matters:** E-commerce website = normal; Unknown website = suspicious

---

## FEATURE INTERACTION PATTERNS

### High-Risk Combinations
1. **New Device + New Recipient + Night + High Amount** = Critical fraud signal
2. **High Velocity (tx_count_1h >> normal) + New Recipient** = Bot attack
3. **Amount >> amount_max + New Device + New Recipient** = Account takeover
4. **New Device + Unusual Hour + New Merchant + is_qr_channel** = Phishing attack pattern
5. **Amount_deviation > 3.0 + is_night + is_new_recipient** = High fraud probability

### Low-Risk Combinations
1. **Regular Recipient (tx_count >> 10) + Normal Amount + Business Hours**
2. **Merchant Transaction + Known Merchant (low merchant_risk_score) + Normal Amount**
3. **P2P to Saved Recipient + Within amount_max + Within amount_mean + Device**

---

## Summary by Importance

**Top 5 Most Important:**
1. `log_amount` (0.2548) - Transaction size
2. `amount` (0.2363) - Raw amount
3. `amount_std` (0.2073) - User's spending variability
4. `is_round_amount` (0.0459) - Round amount indicator
5. `merchant_risk_score` (0.0422) - Recipient riskiness

**Key Insights:**
- **Amount-based features dominate** (account for ~55% of predictive power)
- **Behavioral consistency matters** (std and deviation are critical)
- **New interactions are risky** (new device, new recipient, new merchant)
- **Temporal patterns help** (night, hour, but less important than amount)
- **Velocity spikes indicate fraud** (rapid-fire transactions)

