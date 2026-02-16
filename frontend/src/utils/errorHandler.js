/**
 * Error Handler Utility
 * Provides standardized error handling, user-friendly messages, and logging
 */

// Error type definitions
export const ERROR_TYPES = {
  NETWORK: 'NETWORK_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
  RECIPIENT_NOT_FOUND: 'RECIPIENT_NOT_FOUND',
  INVALID_UPI: 'INVALID_UPI',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN: 'UNKNOWN_ERROR'
};

// User-friendly error messages
const ERROR_MESSAGES = {
  [ERROR_TYPES.NETWORK]: {
    title: 'Connection Error',
    message: 'Unable to connect. Please check your internet connection and try again.',
    severity: 'error'
  },
  [ERROR_TYPES.VALIDATION]: {
    title: 'Invalid Input',
    message: 'Please check your input and try again.',
    severity: 'warning'
  },
  [ERROR_TYPES.AUTHENTICATION]: {
    title: 'Authentication Failed',
    message: 'Your session has expired. Please login again.',
    severity: 'error'
  },
  [ERROR_TYPES.AUTHORIZATION]: {
    title: 'Access Denied',
    message: 'You do not have permission to perform this action.',
    severity: 'error'
  },
  [ERROR_TYPES.INSUFFICIENT_FUNDS]: {
    title: 'Insufficient Balance',
    message: 'Your account balance is not enough for this transaction.',
    severity: 'warning'
  },
  [ERROR_TYPES.TRANSACTION_FAILED]: {
    title: 'Transaction Failed',
    message: 'The transaction could not be processed. Please try again.',
    severity: 'error'
  },
  [ERROR_TYPES.DAILY_LIMIT_EXCEEDED]: {
    title: 'Daily Limit Exceeded',
    message: 'You have exceeded your daily transaction limit.',
    severity: 'warning'
  },
  [ERROR_TYPES.RECIPIENT_NOT_FOUND]: {
    title: 'Recipient Not Found',
    message: 'The recipient UPI ID does not exist.',
    severity: 'warning'
  },
  [ERROR_TYPES.INVALID_UPI]: {
    title: 'Invalid UPI ID',
    message: 'Please enter a valid UPI ID (e.g., username@bank).',
    severity: 'warning'
  },
  [ERROR_TYPES.SERVER_ERROR]: {
    title: 'Server Error',
    message: 'Something went wrong on our end. Please try again later.',
    severity: 'error'
  },
  [ERROR_TYPES.TIMEOUT]: {
    title: 'Request Timeout',
    message: 'The request took too long. Please try again.',
    severity: 'error'
  },
  [ERROR_TYPES.NOT_FOUND]: {
    title: 'Not Found',
    message: 'The requested resource could not be found.',
    severity: 'warning'
  },
  [ERROR_TYPES.UNKNOWN]: {
    title: 'Error Occurred',
    message: 'An unexpected error occurred. Please try again.',
    severity: 'error'
  }
};

/**
 * Error Handler Class
 */
class ErrorHandler {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  /**
   * Identify error type from error object or status code
   */
  identifyErrorType(error) {
    // Network errors
    if (!error) {
      return ERROR_TYPES.NETWORK;
    }

    // Response status errors
    if (error.response) {
      const status = error.response.status;
      if (status === 401) return ERROR_TYPES.AUTHENTICATION;
      if (status === 403) return ERROR_TYPES.AUTHORIZATION;
      if (status === 404) return ERROR_TYPES.NOT_FOUND;
      if (status >= 500) return ERROR_TYPES.SERVER_ERROR;
    }

    // Request error (no response)
    if (error.request && !error.response) {
      if (error.message.includes('timeout')) {
        return ERROR_TYPES.TIMEOUT;
      }
      return ERROR_TYPES.NETWORK;
    }

    // Custom error messages
    const message = error.message || error.toString();
    if (message.includes('insufficient')) return ERROR_TYPES.INSUFFICIENT_FUNDS;
    if (message.includes('recipient')) return ERROR_TYPES.RECIPIENT_NOT_FOUND;
    if (message.includes('UPI') || message.includes('upi')) return ERROR_TYPES.INVALID_UPI;
    if (message.includes('validation')) return ERROR_TYPES.VALIDATION;

    return ERROR_TYPES.UNKNOWN;
  }

  /**
   * Get standardized error object
   */
  getErrorInfo(error, customMessage = null) {
    const errorType = this.identifyErrorType(error);
    const baseInfo = ERROR_MESSAGES[errorType] || ERROR_MESSAGES[ERROR_TYPES.UNKNOWN];

    // Extract server error message if available
    let serverMessage = customMessage;
    if (!serverMessage && error?.response?.data) {
      serverMessage = error.response.data.message || error.response.data.error;
    }

    return {
      type: errorType,
      title: baseInfo.title,
      message: serverMessage || baseInfo.message,
      severity: baseInfo.severity,
      originalError: error,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Log error for debugging
   */
  logError(error, context = '') {
    const errorInfo = this.getErrorInfo(error);
    
    if (this.isDevelopment) {
      console.group(`🔴 Error: ${errorInfo.title}`);
      console.error('Context:', context);
      console.error('Type:', errorInfo.type);
      console.error('Message:', errorInfo.message);
      console.error('Original Error:', errorInfo.originalError);
      console.error('Timestamp:', errorInfo.timestamp);
      console.groupEnd();
    } else {
      // In production, log to analytics service if available
      console.error(`[${errorInfo.type}] ${errorInfo.message}`);
    }

    return errorInfo;
  }

  /**
   * Handle API error responses
   */
  handleAPIError(error, context = 'API Call') {
    const errorInfo = this.logError(error, context);
    return {
      ...errorInfo,
      isAPIError: true
    };
  }

  /**
   * Validate form data
   */
  validateForm(formData, rules) {
    const errors = {};

    Object.entries(rules).forEach(([field, rule]) => {
      const value = formData[field];

      // Required validation
      if (rule.required && (!value || value.toString().trim() === '')) {
        errors[field] = `${rule.label || field} is required`;
        return;
      }

      // Min length validation
      if (rule.minLength && value && value.toString().length < rule.minLength) {
        errors[field] = `${rule.label || field} must be at least ${rule.minLength} characters`;
        return;
      }

      // Max length validation
      if (rule.maxLength && value && value.toString().length > rule.maxLength) {
        errors[field] = `${rule.label || field} cannot exceed ${rule.maxLength} characters`;
        return;
      }

      // Pattern validation (regex)
      if (rule.pattern && value && !rule.pattern.test(value)) {
        errors[field] = rule.message || `${rule.label || field} format is invalid`;
        return;
      }

      // Custom validation
      if (rule.custom && !rule.custom(value)) {
        errors[field] = rule.message || `${rule.label || field} is invalid`;
        return;
      }

      // Type validation
      if (rule.type) {
        if (rule.type === 'number' && isNaN(value)) {
          errors[field] = `${rule.label || field} must be a number`;
        }
        if (rule.type === 'email' && !value.includes('@')) {
          errors[field] = `${rule.label || field} must be a valid email`;
        }
      }
    });

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Validate UPI ID
   */
  validateUPI(upiId) {
    const upiPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z]{3,}$/;
    if (!upiPattern.test(upiId)) {
      return {
        isValid: false,
        error: 'Invalid UPI ID format. Use format: username@bank'
      };
    }
    return { isValid: true };
  }

  /**
   * Validate phone number (Indian format)
   */
  validatePhoneNumber(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return {
        isValid: false,
        error: 'Phone number must be 10 digits'
      };
    }
    return { isValid: true };
  }

  /**
   * Validate transaction amount
   */
  validateAmount(amount, balance, minAmount = 1, maxAmount = 100000) {
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount)) {
      return {
        isValid: false,
        error: 'Amount must be a valid number'
      };
    }

    if (numAmount < minAmount) {
      return {
        isValid: false,
        error: `Minimum transaction amount is ₹${minAmount}`
      };
    }

    if (numAmount > maxAmount) {
      return {
        isValid: false,
        error: `Maximum transaction amount is ₹${maxAmount.toLocaleString('en-IN')}`
      };
    }

    // Balance check disabled for fraud detection demo

    return { isValid: true };
  }

  /**
   * Retry logic for failed requests
   */
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return Promise.reject(lastError);
  }

  /**
   * Create user-friendly error summary
   */
  createErrorSummary(error, context = '') {
    const errorInfo = this.getErrorInfo(error);
    return {
      display: {
        title: errorInfo.title,
        message: errorInfo.message,
        icon: this.getErrorIcon(errorInfo.severity),
        color: this.getErrorColor(errorInfo.severity)
      },
      context,
      timestamp: errorInfo.timestamp,
      type: errorInfo.type
    };
  }

  /**
   * Get error icon based on severity
   */
  getErrorIcon(severity) {
    const icons = {
      error: '🔴',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[severity] || '❌';
  }

  /**
   * Get error color for UI
   */
  getErrorColor(severity) {
    const colors = {
      error: 'text-red-500',
      warning: 'text-yellow-500',
      info: 'text-blue-500'
    };
    return colors[severity] || 'text-gray-500';
  }
}

// Create and export singleton instance
const errorHandler = new ErrorHandler();

export default errorHandler;
