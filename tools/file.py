def dummy_score(features):
    """
    Very simple rule-based risk score:
    features = [amount, hour_of_day, tx_count_1h, new_recipient_flag]
    """
    amount, hour, count_1h, new_rec = features

    score = 0.0

    # Higher amount → higher risk
    if amount > 2000:
        score += 0.5
    if amount > 5000:
        score += 0.8

    # New recipient → add risk
    if new_rec == 1:
        score += 0.3

    # Many transactions in 1 hour → add risk
    if count_1h > 5:
        score += 0.4
    if count_1h > 10:
        score += 0.6

    return min(score, 1.0)  # normalize

def action_from_score(score):
    if score >= 0.8:
        return "BLOCK"
    elif score >= 0.4:
        return "DELAY"
    else:
        return "ALLOW"
