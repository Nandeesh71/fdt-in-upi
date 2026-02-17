export const formatUPIId = (phoneNumber) => {
  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, '');
  // Remove country code (91) if at the start, keeping only 10-digit local number
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  }
  return `${cleaned}@upi`;
};

export const validatePhoneNumber = (phoneNumber) => {
  // Indian phone number validation (10 digits with optional country code)
  const phoneRegex = /^(\+91|91|0)?[6-9]\d{9}$/;
  return phoneRegex.test(phoneNumber);
};

export const formatAmount = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount);
};

export const getRiskColor = (score, riskLevel) => {
  // Use risk_level from backend if available (BLOCKED, DELAYED, APPROVED)
  if (riskLevel) {
    if (riskLevel === 'BLOCKED') return 'red';
    if (riskLevel === 'DELAYED') return 'yellow';
    return 'green';
  }
  
  // Fallback: score is 0-1 range (matching backend thresholds: 0.70=blocked, 0.35=delayed)
  const numScore = parseFloat(score);
  if (numScore >= 0.70) return 'red';
  if (numScore >= 0.35) return 'yellow';
  return 'green';
};

export const getRiskLabel = (score, riskLevel) => {
  // Use risk_level from backend if available (BLOCKED, DELAYED, APPROVED)
  if (riskLevel) {
    if (riskLevel === 'BLOCKED') return 'High Risk';
    if (riskLevel === 'DELAYED') return 'Medium Risk';
    return 'Low Risk';
  }
  
  // Fallback: score is 0-1 range, matching backend thresholds
  // 0.70+ = BLOCKED (High), 0.35-0.69 = DELAYED (Medium), <0.35 = APPROVED (Low)
  const numScore = parseFloat(score);
  if (numScore >= 0.70) return 'High Risk';
  if (numScore >= 0.35) return 'Medium Risk';
  return 'Low Risk';
};

export const formatTimestamp = (dateString, locale = 'en-IN', options = {}) => {
  if (!dateString) return '';

  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(dateString);
  let normalized = String(dateString).trim();

  if (!hasTimezone) {
    normalized = normalized.replace(' ', 'T');
    if (!normalized.endsWith('Z')) {
      normalized = `${normalized}Z`;
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return String(dateString);
  }

  return parsed.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  });
};