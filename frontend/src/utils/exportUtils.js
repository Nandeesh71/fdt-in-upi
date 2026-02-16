/**
 * Export utilities for transactions
 * Supports CSV, JSON, TXT, XML, and HTML report formats
 */

/**
 * Export transactions to CSV format
 * @param {Array} transactions - Array of transaction objects
 * @param {string} fileName - Name of the file (without extension)
 */
export const exportToCSV = (transactions, fileName = 'transactions') => {
  if (!transactions || transactions.length === 0) {
    alert('No transactions to export');
    return;
  }

  // Define CSV headers
    const headers = [
        'Date & Time',
        'Transaction ID',
        'Recipient',
        'Amount',
        'Risk Score',
        'Status',
        'Remarks'
    ];

  // Map transactions to CSV rows
    const rows = transactions.map(tx => {
        const createdAt = new Date(tx.created_at);
        return [
            createdAt.toLocaleString('en-IN'),
            tx.tx_id,
            tx.recipient_vpa,
            `₹${tx.amount.toLocaleString('en-IN')}`,
            (parseFloat(tx.risk_score) * 100).toFixed(2) + '%',
            getStatusLabel(tx.action),
            tx.remarks || '-'
        ];
    });

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Create and download file
  const element = document.createElement('a');
  const file = new Blob([csvContent], { type: 'text/csv' });
  element.href = URL.createObjectURL(file);
  element.download = `${fileName}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

/**
 * Export transactions to JSON format
 * @param {Array} transactions - Array of transaction objects
 * @param {string} fileName - Name of the file (without extension)
 */
export const exportToJSON = (transactions, fileName = 'transactions') => {
  if (!transactions || transactions.length === 0) {
    alert('No transactions to export');
    return;
  }

  // Prepare data with formatted fields
  const exportData = {
    exportedAt: new Date().toISOString(),
    totalTransactions: transactions.length,
        transactions: transactions.map(tx => {
            const createdAt = new Date(tx.created_at);
            return {
                dateTime: createdAt.toLocaleString('en-IN'),
                transactionId: tx.tx_id,
                recipient: tx.recipient_vpa,
                amount: tx.amount,
                riskScore: (parseFloat(tx.risk_score) * 100).toFixed(2) + '%',
                status: getStatusLabel(tx.action),
                remarks: tx.remarks || null
            };
        })
  };

  // Create and download file
  const element = document.createElement('a');
  const file = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  element.href = URL.createObjectURL(file);
  element.download = `${fileName}_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

/**
 * Generate a detailed transaction report
 * @param {Array} transactions - Array of transaction objects
 * @param {string} fileName - Name of the file (without extension)
 */
export const exportToDetailedReport = (transactions, fileName = 'transaction_report') => {
  if (!transactions || transactions.length === 0) {
    alert('No transactions to export');
    return;
  }

  // Calculate statistics
  const stats = calculateTransactionStats(transactions);

  // Generate HTML report
  const htmlContent = generateHTMLReport(transactions, stats);

  // Create and download file
  const element = document.createElement('a');
  const file = new Blob([htmlContent], { type: 'text/html' });
  element.href = URL.createObjectURL(file);
  element.download = `${fileName}_${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

/**
 * Export transactions to TXT format
 * @param {Array} transactions - Array of transaction objects
 * @param {string} fileName - Name of the file (without extension)
 */
export const exportToTXT = (transactions, fileName = 'transactions') => {
    if (!transactions || transactions.length === 0) {
        alert('No transactions to export');
        return;
    }

    const lines = transactions.map((tx, index) => {
        const createdAt = new Date(tx.created_at);
        const riskScore = (parseFloat(tx.risk_score) * 100).toFixed(2) + '%';
        return [
            `#${index + 1}`,
            `Date & Time: ${createdAt.toLocaleString('en-IN')}`,
            `Transaction ID: ${tx.tx_id}`,
            `Recipient: ${tx.recipient_vpa}`,
            `Amount: ₹${tx.amount.toLocaleString('en-IN')}`,
            `Risk Score: ${riskScore}`,
            `Status: ${getStatusLabel(tx.action)}`,
            `Remarks: ${tx.remarks || '-'} `
        ].join('\n');
    });

    const content = [
        'FDT Secure Transactions Export',
        `Generated: ${new Date().toLocaleString('en-IN')}`,
        `Total: ${transactions.length}`,
        '',
        ...lines
    ].join('\n\n');

    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${fileName}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
};

/**
 * Export transactions to XML format
 * @param {Array} transactions - Array of transaction objects
 * @param {string} fileName - Name of the file (without extension)
 */
export const exportToXML = (transactions, fileName = 'transactions') => {
    if (!transactions || transactions.length === 0) {
        alert('No transactions to export');
        return;
    }

    const escapeXml = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };

    const transactionNodes = transactions.map(tx => {
        const createdAt = new Date(tx.created_at);
        const riskScore = (parseFloat(tx.risk_score) * 100).toFixed(2) + '%';
        return `  <transaction>
        <dateTime>${escapeXml(createdAt.toLocaleString('en-IN'))}</dateTime>
        <transactionId>${escapeXml(tx.tx_id)}</transactionId>
        <recipient>${escapeXml(tx.recipient_vpa)}</recipient>
        <amount>${escapeXml(tx.amount)}</amount>
        <riskScore>${escapeXml(riskScore)}</riskScore>
        <status>${escapeXml(getStatusLabel(tx.action))}</status>
        <remarks>${escapeXml(tx.remarks || '')}</remarks>
    </transaction>`;
    }).join('\n');

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<transactions>
    <exportedAt>${new Date().toISOString()}</exportedAt>
    <totalTransactions>${transactions.length}</totalTransactions>
${transactionNodes}
</transactions>`;

    const element = document.createElement('a');
    const file = new Blob([xmlContent], { type: 'application/xml' });
    element.href = URL.createObjectURL(file);
    element.download = `${fileName}_${new Date().toISOString().split('T')[0]}.xml`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
};

/**
 * Helper function to get status label from action
 */
const getStatusLabel = (action) => {
  const labels = {
    'ALLOW': 'Approved',
    'DELAY': 'Pending Review',
    'BLOCK': 'Blocked'
  };
  return labels[action] || action;
};

/**
 * Calculate statistics from transactions
 */
const calculateTransactionStats = (transactions) => {
  const stats = {
    total: transactions.length,
    totalAmount: 0,
    approved: 0,
    pending: 0,
    blocked: 0,
    avgRiskScore: 0,
    highRiskCount: 0,
    mediumRiskCount: 0,
    lowRiskCount: 0
  };

  let riskScoreSum = 0;

  transactions.forEach(tx => {
    stats.totalAmount += tx.amount;
    
    if (tx.action === 'ALLOW') stats.approved++;
    else if (tx.action === 'DELAY') stats.pending++;
    else if (tx.action === 'BLOCK') stats.blocked++;

    const riskScore = parseFloat(tx.risk_score) * 100;
    riskScoreSum += riskScore;

    if (riskScore >= 60) stats.highRiskCount++;
    else if (riskScore >= 30) stats.mediumRiskCount++;
    else stats.lowRiskCount++;
  });

  stats.avgRiskScore = (riskScoreSum / transactions.length).toFixed(2);

  return stats;
};

/**
 * Generate HTML report content
 */
const generateHTMLReport = (transactions, stats) => {
  const reportDate = new Date().toLocaleString('en-IN');
  
    const transactionRows = transactions.map(tx => {
        const createdAt = new Date(tx.created_at);
        return `
        <tr>
            <td style="padding: 10px; border: 1px solid #ddd;">${createdAt.toLocaleString('en-IN')}</td>
            <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 12px;">${tx.tx_id}</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${tx.recipient_vpa}</td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">₹${tx.amount.toLocaleString('en-IN')}</td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${(parseFloat(tx.risk_score) * 100).toFixed(2)}%</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${getStatusLabel(tx.action)}</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${tx.remarks || '-'}</td>
        </tr>
    `;
    }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FDT Secure - Transaction Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header {
            border-bottom: 3px solid #8b5cf6;
            margin-bottom: 30px;
            padding-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            color: #1f2937;
            font-size: 28px;
        }
        .header p {
            margin: 0;
            color: #6b7280;
            font-size: 14px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-card.approved {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }
        .stat-card.pending {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }
        .stat-card.blocked {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }
        .stat-card h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            font-weight: 500;
            opacity: 0.9;
        }
        .stat-card .value {
            font-size: 32px;
            font-weight: bold;
        }
        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 30px 0 15px 0;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        th {
            background-color: #f3f4f6;
            padding: 12px 10px;
            text-align: left;
            font-weight: 600;
            color: #1f2937;
            border: 1px solid #ddd;
            font-size: 13px;
        }
        td {
            padding: 10px;
            border: 1px solid #ddd;
        }
        tr:nth-child(even) {
            background-color: #f9fafb;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 12px;
            text-align: center;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .badge-success {
            background-color: #dcfce7;
            color: #166534;
        }
        .badge-warning {
            background-color: #fef3c7;
            color: #92400e;
        }
        .badge-danger {
            background-color: #fee2e2;
            color: #991b1b;
        }
        .badge-low {
            background-color: #d1fae5;
            color: #065f46;
        }
        .badge-medium {
            background-color: #fed7aa;
            color: #9a3412;
        }
        .badge-high {
            background-color: #fecaca;
            color: #7c2d12;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 FDT Secure Transaction Report</h1>
            <p>Generated on ${reportDate}</p>
        </div>

        <div class="section-title">Transaction Summary</div>
        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total Transactions</h3>
                <div class="value">${stats.total}</div>
            </div>
            <div class="stat-card">
                <h3>Total Amount</h3>
                <div class="value">₹${(stats.totalAmount / 100000).toFixed(1)}L</div>
            </div>
            <div class="stat-card approved">
                <h3>Approved</h3>
                <div class="value">${stats.approved}</div>
            </div>
            <div class="stat-card pending">
                <h3>Pending Review</h3>
                <div class="value">${stats.pending}</div>
            </div>
            <div class="stat-card blocked">
                <h3>Blocked</h3>
                <div class="value">${stats.blocked}</div>
            </div>
            <div class="stat-card">
                <h3>Avg Risk Score</h3>
                <div class="value">${stats.avgRiskScore}%</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
            <div style="background: #d1fae5; padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-weight: 600; color: #065f46; font-size: 18px;">${stats.lowRiskCount}</div>
                <div style="color: #047857; font-size: 14px;">Low Risk</div>
            </div>
            <div style="background: #fed7aa; padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-weight: 600; color: #9a3412; font-size: 18px;">${stats.mediumRiskCount}</div>
                <div style="color: #b45309; font-size: 14px;">Medium Risk</div>
            </div>
            <div style="background: #fecaca; padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-weight: 600; color: #7c2d12; font-size: 18px;">${stats.highRiskCount}</div>
                <div style="color: #b91c1c; font-size: 14px;">High Risk</div>
            </div>
        </div>

        <div class="section-title">Transaction Details</div>
        <table>
            <thead>
                <tr>
                    <th>Date &amp; Time</th>
                    <th>Transaction ID</th>
                    <th>Recipient</th>
                    <th>Amount</th>
                    <th>Risk Score</th>
                    <th>Status</th>
                    <th>Remarks</th>
                </tr>
            </thead>
            <tbody>
                ${transactionRows}
            </tbody>
        </table>

        <div class="footer">
            <p>This report was automatically generated by FDT Secure. For more information, visit your dashboard.</p>
        </div>
    </div>
</body>
</html>
  `;
};
