// UPI Fraud Detection Dashboard - Main JavaScript
// Modularized for better maintainability

console.log('=== Dashboard.js loading ===');

// Toast Notification System
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getToastIcon(type) {
  if (type === 'success') return '✓';
  if (type === 'error') return '✕';
  if (type === 'warning') return '⚠';
  return 'ℹ';
}

function showToast(type, message, title) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.className = `toast toast--${type || 'info'}`;
  toast.innerHTML = `
    <div class="toast__icon" aria-hidden="true">${getToastIcon(type)}</div>
    <div class="toast__content">
      <div class="toast__title">${escapeHtml(title || (type === 'success' ? 'Success' : type === 'error' ? 'Error' : type === 'warning' ? 'Warning' : 'Notice'))}</div>
      <div class="toast__message">${escapeHtml(message)}</div>
    </div>
    <button class="toast__close" aria-label="Dismiss">×</button>
    <div class="toast__progress" aria-hidden="true"></div>
  `;
  container.appendChild(toast);
  
  const closeBtn = toast.querySelector('.toast__close');
  const progressEl = toast.querySelector('.toast__progress');
  
  requestAnimationFrame(() => toast.classList.add('show'));
  
  const duration = 4000;
  const start = Date.now();
  let raf = null;
  
  function tick() {
    const elapsed = Date.now() - start;
    const pct = Math.max(0, 1 - elapsed / duration);
    if (progressEl) progressEl.style.transform = `scaleX(${pct})`;
    if (elapsed >= duration) return remove();
    raf = requestAnimationFrame(tick);
  }
  
  function remove() {
    if (raf) cancelAnimationFrame(raf);
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => {
      try { toast.remove(); } catch (e) {}
    }, 220);
  }
  
  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    remove();
  });
  
  toast.addEventListener('click', () => remove());
  tick();
}

// Global state
let currentTimeRange = '24h';
let txCache = window.txCache || [];
let chatHistory = [];
let sortState = window.sortState || { column: 'time', direction: 'desc' };
let useServerTimeline = false; // prefer server-provided timeline when available
// Prevent stale server responses from overwriting live UI increments
let lastServerTotal = null;
// Track when the time range changes so server should be authoritative
let _rangeChanged = false;
// Response cache to avoid redundant API calls
let _responseCache = {
  'dashboard-data': {},
  'recent-transactions': {},
  'pattern-analytics': {},
  'dashboard-analytics': {}
};
// Simple debounce utility for bursty websocket updates (minimal delay for instant feedback)
const _debounceTimers = {};
function debounce(key, fn, delay = 50) {
  clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(fn, delay);
}

// Chart objects - will be initialized on DOMContentLoaded
let timelineChart, riskPie, fraudBar;

// Sort table function - MUST be defined immediately for onclick handlers
console.log('Defining window.sortTable...');

function updateSortArrows(column, direction) {
  document.querySelectorAll('.sort-arrow').forEach(arrow => {
    arrow.classList.remove('active-asc', 'active-desc');
  });

  const arrows = document.querySelectorAll(`.sort-arrow[data-column="${column}"]`);
  arrows.forEach(arrow => {
    if (direction === 'asc') {
      arrow.classList.add('active-asc');
    } else {
      arrow.classList.add('active-desc');
    }
  });
}

function sortTxCache(column, direction) {
  txCache.sort((a, b) => {
    let aVal, bVal;

    switch (column) {
      case 'time':
        aVal = new Date(a.ts || a.created_at || a.timestamp || 0).getTime();
        bVal = new Date(b.ts || b.created_at || b.timestamp || 0).getTime();
        break;
      case 'user':
        aVal = (a.user_id || a.user || '').toLowerCase();
        bVal = (b.user_id || b.user || '').toLowerCase();
        break;
      case 'amount':
        aVal = Number(a.amount || 0);
        bVal = Number(b.amount || 0);
        break;
      case 'type':
        aVal = (a.action || a.tx_type || a.type || '').toLowerCase();
        bVal = (b.action || b.tx_type || b.type || '').toLowerCase();
        break;
      case 'channel':
        aVal = (a.channel || '').toLowerCase();
        bVal = (b.channel || '').toLowerCase();
        break;
      case 'risk':
        aVal = Number(a.risk_score ?? a.risk ?? 0);
        bVal = Number(b.risk_score ?? b.risk ?? 0);
        break;
      case 'confidence':
        const confOrder = { 'high': 1, 'medium': 2, 'low': 3 };
        aVal = confOrder[(a.confidence_level || 'HIGH').toLowerCase()] || 1;
        bVal = confOrder[(b.confidence_level || 'HIGH').toLowerCase()] || 1;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function applyCurrentSort() {
  updateSortArrows(sortState.column, sortState.direction);
  sortTxCache(sortState.column, sortState.direction);
  renderTransactionTable();
}

window.sortTable = function(column) {
  console.log('✓✓✓ REAL sortTable called with column:', column);
  console.log('Current sortState:', sortState);
  console.log('txCache length:', txCache.length);
  
  // Toggle direction if same column, otherwise default to descending
  if (sortState.column === column) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.column = column;
    sortState.direction = 'desc';
  }

  console.log('New sortState:', sortState);
  console.log('Arrows updated for column:', column, 'direction:', sortState.direction);

  console.log('Table sorted, calling renderTransactionTable');
  applyCurrentSort();
  console.log('renderTransactionTable completed');
};

console.log('✓ sortTable function defined on window');

// Utility functions
// Utility functions
function fmtTS(ts) {
  try { return new Date(ts).toLocaleString(); } catch(e){ return ts; }
}

function safeNumber(el) {
  if (!el) return 0;
  const v = el.textContent.replace(/,/g, '').trim();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// User-facing simplified reason (no model details, no scores)
function getSimplifiedReason(tx) {
  const action = String(tx.action || '').toUpperCase();
  if (action === 'BLOCK') return 'Transaction blocked for security reasons.';
  if (action === 'DELAY') return 'Transaction delayed due to unusual activity.';
  return 'Transaction processed successfully.';
}

function confidencePill(level) {
  const lvl = (level || 'HIGH').toUpperCase();
  const style = lvl === 'LOW'
    ? 'bg-red-50 text-red-700 border border-red-100'
    : lvl === 'MEDIUM'
      ? 'bg-yellow-50 text-yellow-700 border border-yellow-100'
      : 'bg-green-50 text-green-700 border border-green-100';
  return `<span class="inline-flex items-center justify-center px-3 py-0.5 rounded-full text-[10px] font-semibold ${style}" style="min-width: 70px; text-align: center;">${lvl}</span>`;
}

function actionBadge(action) {
  const act = (action || 'ALLOW').toUpperCase();
  const color = act === 'BLOCK' ? '#dc2626' : act === 'DELAY' ? '#eab308' : '#16a34a';
  return `<span class="inline-flex items-center justify-center px-3 py-1 rounded text-xs font-bold" style="min-width: 70px; color: ${color}; border: 2px solid ${color}; background: transparent;">${act}</span>`;
}

function getRangeLabel(range) {
  const labels = {
    '1h': 'Last 1 hour',
    '24h': 'Last 24 hours',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days'
  };
  return labels[range] || 'Custom range';
}

function formatTimelineLabel(raw, range) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  if (range === '1h' || range === '24h') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: '2-digit' });
}

// Initialize charts after DOM is ready
function initCharts() {
  const isDarkMode = document.body.classList.contains('dark-mode');
  const textColor = isDarkMode ? '#e5e7eb' : '#374151';
  const gridColor = isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(229, 231, 235, 0.8)';

  timelineChart = new Chart(document.getElementById('timelineChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Blocked', data: [], borderColor: '#EF4444', tension: 0.3, fill: false },
        { label: 'Delayed', data: [], borderColor: '#F59E0B', tension: 0.3, fill: false },
        { label: 'Allowed', data: [], borderColor: '#10B981', tension: 0.3, fill: false }
      ]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: true, 
      scales: { 
        x: {
          ticks: { color: textColor },
          grid: { color: gridColor }
        }, 
        y: { 
          beginAtZero: true,
          ticks: { color: textColor },
          grid: { color: gridColor }
        }
      },
      plugins: {
        legend: {
          labels: { color: textColor }
        }
      },
      animation: {
        duration: 0 // Disable animations
      }
    }
  });

  riskPie = new Chart(document.getElementById('riskPie').getContext('2d'), {
    type: 'polarArea',
    data: {
      labels: ['Low', 'Medium', 'High', 'Critical'],
      datasets: [{
        data: [0, 0, 0, 0],
        backgroundColor: [
          'rgba(34, 197, 94, 0.7)',
          'rgba(250, 204, 21, 0.7)',
          'rgba(251, 146, 60, 0.7)',
          'rgba(239, 68, 68, 0.7)'
        ],
        borderColor: [
          '#22c55e',
          '#facc15',
          '#fb923c',
          '#ef4444'
        ],
        borderWidth: 2,
        hoverBackgroundColor: [
          'rgba(34, 197, 94, 0.9)',
          'rgba(250, 204, 21, 0.9)',
          'rgba(251, 146, 60, 0.9)',
          'rgba(239, 68, 68, 0.9)'
        ],
        hoverBorderWidth: 3
      }]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: true,
      animation: {
        duration: 1200,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { 
            color: textColor,
            padding: 15,
            font: { size: 12, weight: 'bold' },
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#fff',
          bodyColor: '#e5e7eb',
          borderColor: 'rgba(75, 85, 99, 0.5)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          displayColors: true,
          callbacks: {
            title: function(context) {
              return context[0].label;
            },
            label: function(context) {
              const value = context.raw;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `  Count: ${value} (${percentage}%)`;
            },
            afterBody: function(context) {
              const total = context[0].dataset.data.reduce((a, b) => a + b, 0);
              return total > 0 ? '' : '\nNo transactions';
            }
          }
        }
      },
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 5,
          ticks: {
            display: false,
            stepSize: 1
          },
          grid: { 
            color: 'rgba(75, 85, 99, 0.15)',
            lineWidth: 1,
            circular: true
          },
          angleLines: {
            color: 'rgba(75, 85, 99, 0.1)',
            display: true
          },
          pointLabels: {
            color: textColor,
            font: { size: 11, weight: 'bold' }
          }
        }
      },
      elements: {
        arc: {
          borderAlign: 'inner',
          spacing: 0.05
        }
      },
      hoverOffset: 15,
      hoverRadius: 12
    }
  });

  fraudBar = new Chart(document.getElementById('fraudBar').getContext('2d'), {
    type: 'polarArea',
    data: {
      labels: ['Trust Engine', 'Risk Buffer', 'Dynamic Thresholds', 'Drift Detection', 'Graph Signals'],
      datasets: [{
        data: [0, 0, 0, 0, 0],
        backgroundColor: [
          'rgba(16, 185, 129, 0.65)',
          'rgba(245, 158, 11, 0.65)',
          'rgba(59, 130, 246, 0.65)',
          'rgba(139, 92, 246, 0.65)',
          'rgba(236, 72, 153, 0.65)'
        ],
        borderColor: ['#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          ticks: {
            color: textColor,
            backdropColor: 'transparent',
            font: { size: 9 },
            callback: v => v + '%'
          },
          grid: { color: gridColor }
        }
      },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: textColor,
            font: { size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const raw = ctx.chart._mlRawCounts ? ctx.chart._mlRawCounts[ctx.dataIndex] : 0;
              return ` ${ctx.label}: ${ctx.raw.toFixed(1)}% (${raw} triggers)`;
            }
          }
        }
      },
      animation: {
        duration: 0
      }
    }
  });
}

// Cached fetch - returns cached response if available and fresh (< 30 seconds old)
async function cachedFetch(url, cacheName, cacheMaxAge = 30000) {
  const cacheKey = url.split('?')[0]; // Remove query params from cache key to group by endpoint
  
  // Check if we have a cached response that's still fresh
  if (_responseCache[cacheName] && _responseCache[cacheName][cacheKey]) {
    const cached = _responseCache[cacheName][cacheKey];
    const age = Date.now() - cached.timestamp;
    if (age < cacheMaxAge) {
      console.log(`Using cached response for ${cacheKey} (${age}ms old)`);
      return cached.data;
    }
  }
  
  // Fetch fresh data
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  const data = await res.json();
  
  // Cache the response
  if (!_responseCache[cacheName]) _responseCache[cacheName] = {};
  _responseCache[cacheName][cacheKey] = { data, timestamp: Date.now() };
  
  return data;
}

function invalidateCache(cacheName, urlStartsWith = null) {
  if (!_responseCache[cacheName]) return;
  if (!urlStartsWith) {
    _responseCache[cacheName] = {};
    return;
  }
  Object.keys(_responseCache[cacheName]).forEach((key) => {
    if (key.startsWith(urlStartsWith)) delete _responseCache[cacheName][key];
  });
}

// Debounce helper - prevents rapid duplicate function calls
function debounce(func, delayMs = 500) {
  let timeoutId = null;
  return async function(...args) {
    clearTimeout(timeoutId);
    return new Promise((resolve) => {
      timeoutId = setTimeout(async () => {
        const result = await func.apply(this, args);
        resolve(result);
      }, delayMs);
    });
  };
}

function incrementStatById(statId, delta = 1) {
  const el = document.getElementById(statId);
  if (!el) return;
  const current = parseInt(String(el.textContent || '0').replace(/[,\s]/g, ''), 10) || 0;
  el.textContent = (current + delta).toLocaleString();
}

// Chart Loading State Management
function showChartLoading(chartId) {
  const loadingOverlay = document.getElementById(`${chartId}LoadingOverlay`);
  const noDataOverlay = document.getElementById(`${chartId}NoDataOverlay`);
  const canvas = document.getElementById(chartId);
  if (loadingOverlay) loadingOverlay.style.display = 'flex';
  if (noDataOverlay) noDataOverlay.style.display = 'none';
  if (canvas) {
    canvas.style.opacity = '0';
    canvas.style.visibility = 'hidden';
  }
}

function hideChartLoading(chartId) {
  const loadingOverlay = document.getElementById(`${chartId}LoadingOverlay`);
  const canvas = document.getElementById(chartId);
  if (loadingOverlay) loadingOverlay.style.display = 'none';
  if (canvas) {
    canvas.style.opacity = '1';
    canvas.style.visibility = 'visible';
  }
}

function showChartNoData(chartId) {
  const loadingOverlay = document.getElementById(`${chartId}LoadingOverlay`);
  const noDataOverlay = document.getElementById(`${chartId}NoDataOverlay`);
  const canvas = document.getElementById(chartId);
  
  console.log(`[showChartNoData] chartId: ${chartId}`, {
    loadingOverlay: !!loadingOverlay,
    noDataOverlay: !!noDataOverlay,
    canvas: !!canvas
  });
  
  if (loadingOverlay) loadingOverlay.style.display = 'none';
  if (noDataOverlay) {
    noDataOverlay.style.display = 'flex';
    console.log(`[showChartNoData] Set ${chartId} no-data overlay to flex`);
  }
  if (canvas) {
    canvas.style.opacity = '0';
    canvas.style.visibility = 'hidden';
    console.log(`[showChartNoData] Hid ${chartId} canvas`);
  }
}

function showAllChartsLoading() {
  showChartLoading('timeline');
  showChartLoading('riskPie');
  showChartLoading('fraudBar');
}

function hideAllChartsLoading() {
  hideChartLoading('timeline');
  hideChartLoading('riskPie');
  hideChartLoading('fraudBar');
}

// Transaction Table Loading State Management
function showTableLoading() {
  const tbody = document.getElementById('txTbody');
  if (!tbody) return;
  
  tbody.innerHTML = `
    <tr id="loadingPlaceholder">
      <td colspan="8" class="text-center py-8 text-gray-500">
        <div class="inline-flex items-center gap-2">
          <div class="animate-spin inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full"></div>
          <span>Loading transactions...</span>
        </div>
      </td>
    </tr>
  `;
}

function hideTableLoading() {
  const loadingPlaceholder = document.getElementById('loadingPlaceholder');
  if (loadingPlaceholder) {
    loadingPlaceholder.remove();
  }
}

// Alerts Loading State Management
function showAlertsLoading() {
  const container = document.getElementById('alertsList');
  if (!container) return;
  
  container.innerHTML = `
    <div class="flex items-center gap-2 text-gray-500">
      <div class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
      <span>Loading alerts...</span>
    </div>
  `;
}

function hideAlertsLoading() {
  // Will be cleared when updateHighRiskAlerts runs
}

// Data loading functions
async function loadDashboardData() {
  try {
    const url = `/dashboard-data?time_range=${currentTimeRange}`;
    console.log(`[loadDashboardData] Fetching from: ${url}`);
    const j = await cachedFetch(url, 'dashboard-data', 15000); // 15 second cache for stats
    const s = j.stats || {};
    console.log(`[loadDashboardData] Got stats:`, s);

    // Use max(current UI, serverTotal) to avoid overwriting live increments with a slightly stale value
    const rangeChanged = _rangeChanged;
    const serverTotal = Number(s.totalTransactions || 0);
    lastServerTotal = serverTotal;
    const totalEl = document.getElementById('totalTx');
    if (totalEl) {
      const currentVal = parseInt(String(totalEl.textContent || '0').replace(/[,\s]/g, ''), 10) || 0;
      if (rangeChanged) {
        // When the range changes, trust the server value exactly
        totalEl.textContent = serverTotal.toLocaleString();
      } else {
        const nextVal = Math.max(currentVal, serverTotal);
        totalEl.textContent = nextVal.toLocaleString();
      }
    }
    const blockedEl = document.getElementById('blockedTx');
    const delayedEl = document.getElementById('delayedTx');
    const allowedEl = document.getElementById('allowedTx');

    if (blockedEl) {
      const currentVal = parseInt(String(blockedEl.textContent || '0').replace(/[,\s]/g, ''), 10) || 0;
      const serverVal = Number(s.blocked || 0);
      blockedEl.textContent = (rangeChanged ? serverVal : Math.max(currentVal, serverVal)).toLocaleString();
    }

    if (delayedEl) {
      const currentVal = parseInt(String(delayedEl.textContent || '0').replace(/[,\s]/g, ''), 10) || 0;
      const serverVal = Number(s.delayed || 0);
      delayedEl.textContent = (rangeChanged ? serverVal : Math.max(currentVal, serverVal)).toLocaleString();
    }

    if (allowedEl) {
      const currentVal = parseInt(String(allowedEl.textContent || '0').replace(/[,\s]/g, ''), 10) || 0;
      const serverVal = Number(s.allowed || 0);
      allowedEl.textContent = (rangeChanged ? serverVal : Math.max(currentVal, serverVal)).toLocaleString();
    }

    if (rangeChanged) {
      _rangeChanged = false;
    }

    // Update time range label in the first card (the <p> after #totalTx is the static label)
    const totalTxCard = document.getElementById('totalTx')?.closest('.card');
    const timeLabel = totalTxCard?.querySelector('p.text-xs.text-gray-500');
    if (timeLabel) {
      timeLabel.textContent = getRangeLabel(currentTimeRange);
    }
  } catch (e) {
    console.error('loadDashboardData error', e);
    showToast('error', 'Failed to load dashboard statistics - Data may be outdated. Refresh the page to try again.', 'Data Load Error');
  }
}

async function loadPatternAnalytics() {
  try {
    const url = `/pattern-analytics?time_range=${currentTimeRange}`;
    const data = await cachedFetch(url, 'pattern-analytics', 20000);
    
    // Update ML Pipeline radar chart with normalized percentages
    if (fraudBar) {
      const txCount = data.transactions_analyzed || 1;
      const rawCounts = [
        data.trust_engine_triggers || 0,
        data.risk_buffer_escalations || 0,
        data.dynamic_threshold_adjustments || 0,
        data.drift_alerts || 0,
        data.graph_signal_flags || 0
      ];
      // Normalize each system to 0-100% of transactions analyzed
      const pctData = rawCounts.map(v => Math.min(100, (v / txCount) * 100));
      
      // Store raw counts for tooltips
      fraudBar._mlRawCounts = rawCounts;
      fraudBar.data.datasets[0].data = pctData;
      fraudBar.update('none');
      
      // Update the summary line under the chart
      const summaryEl = document.getElementById('mlPipelineSummary');
      if (summaryEl) {
        const activeCount = rawCounts.filter(v => v > 0).length;
        summaryEl.textContent = `${activeCount}/5 systems active | ${txCount} transactions analyzed`;
      }
      
      // Check if chart has any data
      const total = rawCounts.reduce((a, b) => a + b, 0);
      if (total === 0) {
        showChartNoData('fraudBar');
      } else {
        hideChartLoading('fraudBar');
      }
    }
  } catch (e) {
    console.error('loadPatternAnalytics error, leaving existing chart data intact:', e);
    showChartNoData('fraudBar');
  }
}

async function loadModelAccuracy() {
  try {
    const res = await fetch(`/model-accuracy?_=${Date.now()}`);
    if (!res.ok) {
      console.warn('Model accuracy fetch failed');
      return;
    }

    const data = await res.json();
    
    // Update model accuracy displays
    const rfEl = document.getElementById('rfAccuracy');
    const xgbEl = document.getElementById('xgbAccuracy');
    const ifEl = document.getElementById('iforestAccuracy');
    const ensembleEl = document.getElementById('ensembleAccuracy');
    
    if (rfEl) rfEl.textContent = `${data.random_forest}%`;
    if (xgbEl) xgbEl.textContent = `${data.xgboost}%`;
    if (ifEl) ifEl.textContent = `${data.isolation_forest}%`;
    if (ensembleEl) ensembleEl.textContent = `${data.ensemble}%`;
  } catch (e) {
    console.error('loadModelAccuracy error:', e);
  }
}

function getLimitForRange(range) {
  switch (range) {
    case '1h':
      return 50; // finer granularity
    case '24h':
      return 300; // enough to populate hourly buckets
    case '7d':
      return 1500; // larger window for week view
    case '30d':
      return 3000; // month view aggregation
    default:
      return 200;
  }
}

async function loadRecentTransactions() {
  try {
    const limit = getLimitForRange(currentTimeRange);
    const url = `/recent-transactions?limit=${limit}&time_range=${currentTimeRange}`;
    console.log(`[loadRecentTransactions] Fetching from: ${url}`);
    const j = await cachedFetch(url, 'recent-transactions', 20000); // 20 second cache for transactions
    txCache = Array.isArray(j.transactions) ? j.transactions : [];
    console.log(`[loadRecentTransactions] Loaded ${txCache.length} transactions`);

    // Sort and render table without toggling sort direction
    if (typeof applyCurrentSort === 'function') {
      console.log('[loadRecentTransactions] Applying current sort state');
      applyCurrentSort();
    } else if (window.sortTable) {
      console.log('[loadRecentTransactions] Calling window.sortTable');
      window.sortTable(sortState.column);
    } else {
      console.log('[loadRecentTransactions] window.sortTable not found, calling renderTransactionTable directly');
      renderTransactionTable();
    }

    // Immediately update charts from fresh cache data, including realtime timeline
    updateHighRiskAlerts(txCache);
    updateTimelineFromCache();
    updateRiskDistributionFromCache();
    console.log('[loadRecentTransactions] Complete');
  } catch (e) {
    console.error('loadRecentTransactions error', e);
    showToast('error', 'Unable to fetch recent transactions - Please check your connection and refresh the page', 'Transaction Load Failed');
  }
}

// Aggregated analytics for charts
async function loadDashboardAnalytics() {
  try {
    const url = `/dashboard-analytics?time_range=${currentTimeRange}`;
    const data = await cachedFetch(url, 'dashboard-analytics', 15000);
    
    // DISABLED server timeline - using client-side cache timeline for consistency
    // This prevents dual updates that overwrite each other
    console.log('Server analytics loaded, but using client-side timeline generation');
    
  } catch (e) {
    console.error('loadDashboardAnalytics error', e);
  }
}

// Transaction row builder
function makeTxRow(tx) {
  const o = Object.assign({}, tx || {});
  const ts = o.ts || o.created_at || o.timestamp || new Date().toISOString();
  const txid = o.tx_id || o.id || '';
  const user = o.user_id || o.user || '';
  const amount = (o.amount === undefined) ? 0 : Number(o.amount);
  const type = o.action || o.tx_type || o.type || '';
    const channel = o.channel || 'N/A';
    const risk = Number(o.risk_score ?? o.risk ?? 0).toFixed(2);
    const confidence = confidencePill(o.confidence_level);
    const action = (o.action || 'ALLOW').toUpperCase();
    const riskColor = action === 'BLOCK' ? '#dc2626' : action === 'DELAY' ? '#eab308' : '#16a34a';

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="px-3 py-2">${fmtTS(ts)}</td>
    <td class="px-3 py-2">${txid}</td>
    <td class="px-3 py-2">${user}</td>
    <td class="px-3 py-2">₹${Number(amount || 0).toFixed(2)}</td>
    <td class="px-3 py-2">${actionBadge(type)}</td>
    <td class="px-3 py-2">${channel}</td>
    <td class="px-3 py-2 font-bold" style="color: ${riskColor};">${risk}</td>
      <td class="px-3 py-2">${confidence}</td>
  `;
  // Tooltip with simplified reason only (no model names / scores)
  tr.title = getSimplifiedReason(o);
  return tr;
}

// Render transaction table from cache - OPTIMIZED with document fragment
function renderTransactionTable() {
  const tbody = document.getElementById('txTbody');
  if (!tbody) {
    console.error('txTbody not found');
    return;
  }
  
  // Remove loading placeholder if it exists
  const loadingPlaceholder = document.getElementById('loadingPlaceholder');
  if (loadingPlaceholder) {
    loadingPlaceholder.remove();
  }
  
  // Apply filter if set
  const filter = document.getElementById('txFilter')?.value || 'ALL';
  const filteredTx = filter === 'ALL' 
    ? txCache 
    : txCache.filter(tx => (tx.action || tx.tx_type || tx.type || '') === filter);
  
  // Use document fragment to batch DOM updates (much faster than individual appends)
  const fragment = document.createDocumentFragment();
  
  // Limit visible rows to 100 for performance (user can scroll/filter)
  const maxRows = 100;
  for (let i = 0; i < Math.min(filteredTx.length, maxRows); i++) {
    fragment.appendChild(makeTxRow(filteredTx[i]));
  }
  
  // Clear all existing rows
  tbody.innerHTML = '';
  
  if (fragment.childNodes.length > 0) {
    tbody.appendChild(fragment);
    console.log(`✓ Rendered ${filteredTx.length} of ${txCache.length} transactions`);
  } else {
    // Show "no data" message if no transactions
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="8" class="text-center py-4 text-gray-500">No transactions found</td>';
    tbody.appendChild(tr);
    console.log('No transactions to render');
  }
}

// Chart update functions
function updateRiskDistributionFromCache() {
  console.log('[updateRiskDistributionFromCache] Called', {
    riskPie: !!riskPie,
    txCache: Array.isArray(txCache),
    txCacheLength: txCache?.length
  });
  
  if (!riskPie || !Array.isArray(txCache)) {
    console.log('[updateRiskDistributionFromCache] Early return - no chart or cache');
    return;
  }
  
  if (txCache.length === 0) {
    console.log('[updateRiskDistributionFromCache] No data - showing no-data overlay');
    // Show no data overlay when there are no transactions
    riskPie.data.datasets[0].data = [0, 0, 0, 0];
    riskPie.update('none');
    showChartNoData('riskPie');
    return;
  }

  console.log('[updateRiskDistributionFromCache] Processing', txCache.length, 'transactions');
  let low = 0, medium = 0, high = 0, critical = 0;

  txCache.forEach(tx => {
    const r = Number(tx.risk_score ?? 0);
    if (r < 0.3) low++;
    else if (r < 0.6) medium++;
    else if (r < 0.8) high++;
    else critical++;
  });

  riskPie.data.labels = ['Low', 'Medium', 'High', 'Critical'];
  riskPie.data.datasets[0].data = [low, medium, high, critical];
  
  // Calculate appropriate max to keep grid lines at 5-6
  const maxValue = Math.max(low, medium, high, critical);
  // Round up to nearest multiple of 5, minimum 5
  const chartMax = Math.max(5, Math.ceil(maxValue / 5) * 5);
  riskPie.options.scales.r.max = chartMax;
  riskPie.options.scales.r.ticks.stepSize = chartMax / 5;
  
  riskPie.update();
  
  // Hide loading/no-data overlay since we have data
  console.log('[updateRiskDistributionFromCache] Data loaded - hiding overlays');
  hideChartLoading('riskPie');
}

function updateTimelineFromCache() {
  if (!timelineChart || !Array.isArray(txCache)) return;

  const buckets = {};
  const labelDates = []; // Store dates with their string labels for proper sorting
  let labelFormat;

  // Determine label format based on time range
  if (currentTimeRange === '1h') {
    labelFormat = 'time'; // HH:MM format
  } else if (currentTimeRange === '24h') {
    labelFormat = 'time_1h'; // 1-hour interval format
  } else if (currentTimeRange === '7d') {
    labelFormat = 'date'; // MMM DD format - all 7 days
  } else if (currentTimeRange === '30d') {
    labelFormat = 'date'; // MMM DD format - all 30 days
  }

  // Generate labels for date-based views first (oldest to newest)
  if (currentTimeRange === '7d') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) { // Start from 6 days ago to today
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString([], { month: 'short', day: '2-digit' });
      labelDates.push({ date: new Date(d), label });
      buckets[label] = { BLOCK: 0, DELAY: 0, ALLOW: 0 };
    }
  } else if (currentTimeRange === '30d') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) { // Start from 29 days ago to today
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString([], { month: 'short', day: '2-digit' });
      labelDates.push({ date: new Date(d), label });
      buckets[label] = { BLOCK: 0, DELAY: 0, ALLOW: 0 };
    }
  } else if (currentTimeRange === '24h') {
    // Generate 24 hourly labels (oldest to newest)
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(d.getHours() - i);
      d.setMinutes(0, 0, 0);
      const hour = String(d.getHours()).padStart(2, '0');
      const label = `${hour}:00`;
      labelDates.push({ date: new Date(d), label });
      buckets[label] = { BLOCK: 0, DELAY: 0, ALLOW: 0 };
    }
  }

  // Process transactions and match to buckets
  if (Array.isArray(txCache) && txCache.length > 0) {
    txCache.forEach(tx => {
      const ts = new Date(tx.ts || tx.created_at || tx.timestamp);
      if (isNaN(ts)) return;

      let key;
      if (labelFormat === 'time') {
        // For 1h: Show exact time (HH:MM)
        key = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (!buckets[key]) {
          buckets[key] = { BLOCK: 0, DELAY: 0, ALLOW: 0 };
          labelDates.push({ date: ts, label: key });
        }
      } else if (labelFormat === 'time_1h') {
        // For 24h: Group into hourly buckets
        const hour = ts.getHours();
        const label = String(hour).padStart(2, '0') + ':00';
        key = label;
      } else if (labelFormat === 'date') {
        // For 7d and 30d: Show date (MMM DD)
        key = ts.toLocaleDateString([], { month: 'short', day: '2-digit' });
      }

      const action = (tx.action || '').toUpperCase();
      if (buckets[key]) {
        if (buckets[key][action] !== undefined) {
          buckets[key][action]++;
        }
      }
    });
  }

  // Extract labels in chronological order
  const labels = labelDates.map(item => item.label);

  // Update chart
  if (timelineChart) {
    timelineChart.data.labels = labels;
    timelineChart.data.datasets[0].data = labels.map(l => buckets[l]?.BLOCK || 0);
    timelineChart.data.datasets[1].data = labels.map(l => buckets[l]?.DELAY || 0);
    timelineChart.data.datasets[2].data = labels.map(l => buckets[l]?.ALLOW || 0);
    timelineChart.update('none');
    
    // Check if chart has any data
    const hasData = txCache && txCache.length > 0;
    if (!hasData) {
      showChartNoData('timeline');
    } else {
      hideChartLoading('timeline');
    }
  }
}

function updateHighRiskAlerts(transactions) {
  const container = document.getElementById('alertsList');
  if (!container) return;

  container.innerHTML = '';

  transactions
    .filter(tx => Number(tx.risk_score || 0) >= 0.8)
    .slice(0, 10)
    .forEach(tx => {
      const div = document.createElement('div');
      div.className = 'p-2 border rounded bg-red-50 text-red-800';
      const reason = getSimplifiedReason(tx);
      const confidence = String(tx.confidence_level || '').toUpperCase();
      const confidenceTag = confidencePill(confidence);
      const lowWarn = confidence === 'LOW' ? '<span class="text-xs text-red-700 font-semibold ml-1">⚠ low confidence</span>' : '';
      div.innerHTML = `
        <div class="font-semibold">${tx.tx_id}</div>
        <div>User: ${tx.user_id}</div>
        <div>Amount: ₹${Number(tx.amount).toFixed(2)}</div>
        <div>Action: ${tx.action}</div>
        <div class="flex items-center gap-2">Confidence: ${confidenceTag} ${lowWarn}</div>
        <div>Reason: ${reason}</div>
      `;
      container.appendChild(div);
    });

  if (!container.children.length) {
    container.innerHTML = '<div class="text-gray-500">No high-risk transactions</div>';
  }
}

// WebSocket setup
function setupWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    showToast('success', 'Connected to real-time data stream - You\'ll receive instant updates for new transactions', 'Live Updates Active');
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (!msg || !msg.data) return;

      const txObj = msg.data;
      const msgType = String(msg.type || '').toLowerCase();

      if (msgType === 'tx_inserted') {
        txCache.unshift(txObj);
        if (txCache.length > 200) txCache.pop();

        renderTransactionTable();

        // Immediate chart updates with no debounce for instant visual feedback
        updateHighRiskAlerts(txCache);
        // Always push realtime updates to the timeline from cache
        updateTimelineFromCache();
        updateRiskDistributionFromCache();

        // Immediately reflect the new transaction in the total card
        try {
          const totalEl = document.getElementById('totalTx');
          if (totalEl) {
            const currentVal = parseInt(String(totalEl.textContent || '0').replace(/[,\s]/g, ''), 10) || 0;
            const newVal = currentVal + 1;
            totalEl.textContent = newVal.toLocaleString();
          }
        } catch (e) {
          console.warn('Inline totalTx update failed, will refresh via API', e);
        }

        // Immediately reflect the new transaction in action cards
        try {
          const action = String(txObj.action || '').toUpperCase();
          if (action === 'ALLOW') incrementStatById('allowedTx', 1);
          else if (action === 'DELAY') incrementStatById('delayedTx', 1);
          else if (action === 'BLOCK') incrementStatById('blockedTx', 1);
        } catch (e) {
          console.warn('Inline action card update failed, will refresh via API', e);
        }

        // Minimal debounce for backend refreshes (charts already updated from cache)
        debounce('dashboardData', () => loadDashboardData(), 100);
        debounce('patternAnalytics', () => loadPatternAnalytics(), 150);
      }

      if (msgType === 'tx_updated') {
        invalidateCache('recent-transactions', '/recent-transactions');
        invalidateCache('dashboard-data', '/dashboard-data');
        invalidateCache('pattern-analytics', '/pattern-analytics');
        loadRecentTransactions();
        debounce('dashboardData', () => loadDashboardData(), 100);
        debounce('patternAnalytics', () => loadPatternAnalytics(), 150);
      }
    } catch (e) {
      console.error('WebSocket error:', e);
    }
  };

  ws.onclose = () => {
    showToast('warning', 'Lost connection to real-time updates - Attempting to reconnect...', 'Connection Lost');
    setTimeout(setupWebSocket, 2000);
  };
  ws.onerror = () => ws.close();
}

// Chatbot functions
function addChatMessage(content, isUser = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `chatbot-message ${isUser ? 'user' : 'bot'}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'chatbot-message-content';
  
  // Format with proper line breaks
  let formatted = content.trim();
  
  // Detect and style section headers (supports ──, ───, ━━, ━━━, ==, ===)
  if (formatted.includes('─') || formatted.includes('━') || /={2,}/.test(formatted)) {
    const lines = formatted.split('\n');
    let htmlContent = '';
    
    lines.forEach(line => {
      line = line.trim();
      
      // Section header detection - matches 2+ separator chars on each side
      if (/^[─━=]{2,}.*[─━=]{2,}$/.test(line)) {
        const title = line.replace(/[─━=]/g, '').trim();
        htmlContent += `<div class="msg-section-header">${title}</div>`;
      } else if (line) {
        htmlContent += `<div>${line}</div>`;
      } else {
        htmlContent += '<br>';
      }
    });
    
    contentDiv.innerHTML = htmlContent;
  } else {
    contentDiv.textContent = formatted;
  }
  
  messageDiv.appendChild(contentDiv);
  document.getElementById('chatbotMessages').appendChild(messageDiv);
  document.getElementById('chatbotMessages').scrollTop = document.getElementById('chatbotMessages').scrollHeight;
}

function showTypingIndicator() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chatbot-message bot';
  typingDiv.id = 'typingIndicator';
  
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator chatbot-message-content';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  
  typingDiv.appendChild(indicator);
  document.getElementById('chatbotMessages').appendChild(typingDiv);
  document.getElementById('chatbotMessages').scrollTop = document.getElementById('chatbotMessages').scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) indicator.remove();
}

async function sendChatMessage() {
  const chatbotInput = document.getElementById('chatbotInput');
  const chatbotSend = document.getElementById('chatbotSend');
  const message = chatbotInput.value.trim();
  if (!message) return;
  
  addChatMessage(message, true);
  chatHistory.push({ role: 'user', content: message });
  
  chatbotInput.value = '';
  chatbotSend.disabled = true;
  chatbotInput.disabled = true;
  
  showTypingIndicator();
  
  try {
    const response = await fetch('/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        time_range: currentTimeRange,
        history: chatHistory.slice(-10)
      })
    });
    
    if (!response.ok) throw new Error('Chatbot request failed');
    
    const data = await response.json();
    removeTypingIndicator();
    addChatMessage(data.response, false);
    chatHistory.push({ role: 'assistant', content: data.response });
  } catch (error) {
    console.error('Chatbot error:', error);
    removeTypingIndicator();
    addChatMessage('Sorry, I encountered an error. Please try again.', false);
    showToast('error', 'Unable to reach AI assistant - Please check your connection and try again', 'Chatbot Error');
  } finally {
    chatbotSend.disabled = false;
    chatbotInput.disabled = false;
    chatbotInput.focus();
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Initialize dark mode from localStorage FIRST (before charts)
  const darkMode = localStorage.getItem('darkMode') === 'true';
  if (darkMode) {
    document.body.classList.add('dark-mode');
    updateDarkModeButton(true);
  }

  // Initialize charts AFTER dark mode is set
  try {
    initCharts();
  } catch (err) {
    console.error('Chart initialization error:', err);
    // Continue loading data even if charts fail
  }

  // Initialize data loading
  try {
    loadDashboardData();
    loadRecentTransactions();
    loadDashboardAnalytics(); // server aggregated timeline for full range coverage
    loadPatternAnalytics();
    loadModelAccuracy(); // Load model performance metrics
  } catch (err) {
    console.error('Initial data loading error:', err);
  }

  try {
    setupWebSocket();
  } catch (err) {
    console.error('WebSocket setup error:', err);
  }

  setInterval(loadDashboardData, 30000);
  setInterval(loadPatternAnalytics, 30000); // Refresh patterns every 30s

  // Time range selector - optimized for instant updates
  document.getElementById('timeRange').addEventListener('change', async (e) => {
    currentTimeRange = e.target.value;
    _rangeChanged = true;
    
    // Show loading state on all charts, table, and alerts immediately
    showAllChartsLoading();
    showTableLoading();
    showAlertsLoading();
    
    // Clear chart data AND transaction cache immediately to prevent stale data rendering
    txCache = []; // Clear cache to prevent updateTimelineFromCache from using old data
    
    if (timelineChart) {
      timelineChart.data.labels = [];
      timelineChart.data.datasets.forEach(ds => ds.data = []);
      timelineChart.update('none');
    }
    if (riskPie) {
      riskPie.data.datasets[0].data = [0, 0, 0, 0];
      riskPie.update('none');
    }
    if (fraudBar) {
      fraudBar.data.datasets[0].data = [0, 0, 0, 0, 0];
      fraudBar.update('none');
    }
    
    // Clear response cache for all endpoints to ensure fresh data on range change
    _responseCache['dashboard-data'] = {};
    _responseCache['recent-transactions'] = {};
    _responseCache['dashboard-analytics'] = {};
    _responseCache['pattern-analytics'] = {};
    
    // Fetch all data in parallel for fastest response
    await Promise.all([
      loadDashboardData(),
      loadRecentTransactions(),
      loadDashboardAnalytics(),
      loadPatternAnalytics()
    ]);
    
    const rangeLabel = currentTimeRange === '1h' ? 'last hour' : currentTimeRange === '24h' ? 'last 24 hours' : currentTimeRange === '7d' ? 'last 7 days' : 'last 30 days';
    showToast('info', `Dashboard updated with data from ${rangeLabel}`, 'Time Range Changed');
    
    // Hide loading state when done
    hideAllChartsLoading();
  });

  // Export - Show Modal
  document.getElementById('exportBtn').addEventListener('click', () => {
    const modal = document.getElementById('exportModal');
    modal.style.display = 'flex';
    // Set default dates
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    document.getElementById('exportEndDate').value = now.toISOString().slice(0, 16);
    document.getElementById('exportStartDate').value = start.toISOString().slice(0, 16);
  });

  // Handle custom date range visibility
  document.getElementById('exportTimeRange').addEventListener('change', (e) => {
    const customRange = document.getElementById('customDateRange');
    customRange.style.display = e.target.value === 'custom' ? 'block' : 'none';
  });

  // Transaction filter
  document.getElementById('txFilter').addEventListener('change', (e) => {
    const filter = e.target.value;
    renderTransactionTable();
    const filterLabel = filter === 'ALL' ? 'all transactions' : filter === 'BLOCK' ? 'blocked transactions' : filter === 'DELAY' ? 'delayed transactions' : 'allowed transactions';
    const count = filter === 'ALL' ? txCache.length : txCache.filter(tx => (tx.action || tx.tx_type || tx.type || '') === filter).length;
    showToast('info', `Displaying ${count} ${filterLabel}`, 'Filter Applied');
  });

  // Risk Score Modal
  document.getElementById('infoBtn').addEventListener('click', () => {
    document.getElementById('riskScoreModal').classList.add('open');
  });

  document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('riskScoreModal').classList.remove('open');
  });

  document.getElementById('riskScoreModal').addEventListener('click', (e) => {
    if (e.target.id === 'riskScoreModal') {
      document.getElementById('riskScoreModal').classList.remove('open');
    }
  });

  // Fraud Pattern Modal
  document.getElementById('fraudPatternInfoBtn').addEventListener('click', () => {
    document.getElementById('fraudPatternModal').classList.add('open');
  });

  document.getElementById('closeFraudPatternModal').addEventListener('click', () => {
    document.getElementById('fraudPatternModal').classList.remove('open');
  });

  document.getElementById('fraudPatternModal').addEventListener('click', (e) => {
    if (e.target.id === 'fraudPatternModal') {
      document.getElementById('fraudPatternModal').classList.remove('open');
    }
  });

  // Risk Distribution Modal
  document.getElementById('riskDistInfoBtn').addEventListener('click', () => {
    document.getElementById('riskDistModal').classList.add('open');
  });

  document.getElementById('closeRiskDistModal').addEventListener('click', () => {
    document.getElementById('riskDistModal').classList.remove('open');
  });

  document.getElementById('riskDistModal').addEventListener('click', (e) => {
    if (e.target.id === 'riskDistModal') {
      document.getElementById('riskDistModal').classList.remove('open');
    }
  });

  // Model Performance Metrics Modal
  document.getElementById('modelMetricsInfoBtn').addEventListener('click', () => {
    document.getElementById('modelMetricsModal').classList.add('open');
  });

  document.getElementById('closeModelMetricsModal').addEventListener('click', () => {
    document.getElementById('modelMetricsModal').classList.remove('open');
  });

  document.getElementById('modelMetricsModal').addEventListener('click', (e) => {
    if (e.target.id === 'modelMetricsModal') {
      document.getElementById('modelMetricsModal').classList.remove('open');
    }
  });

  // Chatbot
  document.getElementById('chatbotToggle').addEventListener('click', () => {
    const chatbotWindow = document.getElementById('chatbotWindow');
    const wasOpen = chatbotWindow.classList.contains('open');
    chatbotWindow.classList.toggle('open');
    if (chatbotWindow.classList.contains('open')) {
      document.getElementById('chatbotInput').focus();
      if (!wasOpen) {
        showToast('info', 'Ask me about transaction patterns, risk scores, or fraud detection insights', 'AI Assistant Ready');
      }
    }
  });

  document.getElementById('chatbotClose').addEventListener('click', () => {
    document.getElementById('chatbotWindow').classList.remove('open');
  });

  document.getElementById('chatbotSend').addEventListener('click', sendChatMessage);

  document.getElementById('chatbotInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });

  // Dark mode toggle
  document.getElementById('darkModeToggle').addEventListener('click', () => {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
    updateDarkModeButton(isDarkMode);
    updateChartColors(isDarkMode);
    showToast('info', isDarkMode ? 'Dark mode enabled - Easier on the eyes in low light' : 'Light mode enabled - Bright and clear display', 'Display Mode Changed');
  });
});

// Update chart colors for dark mode
function updateChartColors(isDarkMode) {
  const textColor = isDarkMode ? '#e5e7eb' : '#374151';
  const gridColor = isDarkMode ? 'rgba(71, 85, 105, 0.3)' : 'rgba(229, 231, 235, 0.8)';

  // Update timeline chart
  if (timelineChart) {
    timelineChart.options.scales.x.ticks.color = textColor;
    timelineChart.options.scales.x.grid.color = gridColor;
    timelineChart.options.scales.y.ticks.color = textColor;
    timelineChart.options.scales.y.grid.color = gridColor;
    timelineChart.options.plugins.legend.labels.color = textColor;
    timelineChart.update();
  }

  // Update risk pie chart
  if (riskPie) {
    riskPie.options.plugins.legend.labels.color = textColor;
    riskPie.update();
  }

  // Update fraud polar area chart
  if (fraudBar) {
    fraudBar.options.scales.r.ticks.color = textColor;
    fraudBar.options.scales.r.grid.color = gridColor;
    fraudBar.options.plugins.legend.labels.color = textColor;
    fraudBar.update();
  }
}

// Dark mode button text updater
function updateDarkModeButton(isDarkMode) {
  const btn = document.getElementById('darkModeToggle');
  if (isDarkMode) {
    btn.textContent = '☀️ Light';
    btn.style.background = 'linear-gradient(to right, #f59e0b, #eab308)';
    btn.style.color = '#ffffff';
  } else {
    btn.textContent = '🌙 Dark';
    btn.style.background = 'linear-gradient(to right, #4f46e5, #3b82f6)';
    btn.style.color = '#ffffff';
  }
}

// Export functionality with time range and format selection
async function performExport() {
  const pad2 = (n) => String(n).padStart(2, '0');
  const formatDateTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).trim();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} | ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  };
  const clean = (value) => (value === null || value === undefined) ? '' : String(value).replace(/\s+/g, ' ').trim();
  const num = (value, digits = 2) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : '';
  };

  // Get export button and show loading state
  const exportSubmitBtn = document.getElementById('exportSubmitBtn');
  const exportSubmitText = exportSubmitBtn ? exportSubmitBtn.querySelector('.export-submit-text') : null;
  const exportSubmitLoading = exportSubmitBtn ? exportSubmitBtn.querySelector('.export-submit-loading') : null;

  try {
    // Show loading state
    if (exportSubmitBtn) exportSubmitBtn.disabled = true;
    if (exportSubmitText) exportSubmitText.style.display = 'none';
    if (exportSubmitLoading) exportSubmitLoading.style.display = 'flex';

    // Get selected options
    const timeRange = document.getElementById('exportTimeRange').value;
    const format = document.getElementById('exportFormat').value;
    
    // Calculate date range
    const endDate = new Date();
    let startDate = new Date(endDate.getTime());
    
    if (timeRange === '24h') {
      startDate.setHours(startDate.getHours() - 24);
    } else if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (timeRange === 'custom') {
      startDate = new Date(document.getElementById('exportStartDate').value);
    }

    console.log(`Export range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Fetch ALL transactions from server for the specified time range
    // The time_range parameter tells the API to ignore limit and return ALL transactions in that period
    const response = await fetch(`/recent-transactions?limit=99999&time_range=${timeRange}&_=${Date.now()}`);
    if (!response.ok) throw new Error('Failed to fetch transactions');
    
    const data = await response.json();
    let allTx = data.transactions || [];

    // Filter by date range (extra safety filter for custom ranges)
    const filteredTx = allTx.filter(tx => {
      const txDate = new Date(tx.ts || tx.created_at || tx.timestamp);
      return txDate >= startDate && txDate <= endDate;
    });

    if (filteredTx.length === 0) {
      const rangeLabel = timeRange === '24h' ? 'last 24 hours' : timeRange === '7d' ? 'last 7 days' : timeRange === '30d' ? 'last 30 days' : 'selected date range';
      showToast('warning', `No transaction data available for ${rangeLabel}. Try selecting a different time period.`, 'No Data Found');
      return;
    }

    // Headers
    const headers = [
      'Timestamp',
      'Transaction ID',
      'User ID',
      'Amount',
      'Action',
      'Channel',
      'Risk Score',
      'Confidence Level',
      'Recipient VPA',
      'Device ID',
      'Created At'
    ];

    // Build rows
    const rows = [headers];
    filteredTx.forEach(tx => {
      rows.push([
        formatDateTime(tx.ts || tx.created_at || tx.timestamp),
        clean(tx.tx_id || tx.id),
        clean(tx.user_id || tx.user),
        num(tx.amount, 2),
        clean((tx.action || 'ALLOW').toUpperCase()),
        clean(tx.channel),
        num(tx.risk_score ?? tx.risk, 4),
        clean((tx.confidence_level || '').toUpperCase()),
        clean(tx.recipient_vpa),
        clean(tx.device_id),
        formatDateTime(tx.created_at || tx.timestamp)
    ]);
  });

    let content, fileName, mimeType;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_');

    if (format === 'csv') {
      const csvBody = rows.map(r => r.map(c => {
        const escaped = String(c ?? '').replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')).join('\n');
      content = `\ufeff${csvBody}`;
      fileName = `transactions_${timestamp}.csv`;
      mimeType = 'text/csv;charset=utf-8;';
    } else if (format === 'json') {
      const jsonData = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });
      content = JSON.stringify(jsonData, null, 2);
      fileName = `transactions_${timestamp}.json`;
      mimeType = 'application/json;charset=utf-8;';
    } else if (format === 'txt') {
      const txtBody = rows.map(r => r.join('\t')).join('\n');
      content = txtBody;
      fileName = `transactions_${timestamp}.txt`;
      mimeType = 'text/plain;charset=utf-8;';
    } else if (format === 'xlsx') {
      const csvBody = rows.map(r => r.map(c => {
        const escaped = String(c ?? '').replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')).join('\n');
      content = csvBody;
      fileName = `transactions_${timestamp}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;';
    }

    // Create and trigger download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    // Close modal and show success
    document.getElementById('exportModal').style.display = 'none';
    const formatName = format === 'csv' ? 'CSV' : format === 'json' ? 'JSON' : format === 'txt' ? 'TXT' : 'XLSX';
    const rangeLabel = timeRange === '24h' ? 'last 24 hours' : timeRange === '7d' ? 'last 7 days' : timeRange === '30d' ? 'last 30 days' : 'selected period';
    showToast('success', `Successfully exported ${filteredTx.length} transaction records from ${rangeLabel} to ${fileName}`, `${formatName} Export Complete`);
  } catch (error) {
    console.error('Export failed:', error);
    showToast('error', `Unable to export transactions - ${error.message}. Please check your browser settings and try again.`, 'Export Failed');
  } finally {
    // Reset button state
    const exportSubmitBtn = document.getElementById('exportSubmitBtn');
    if (exportSubmitBtn) {
      const exportSubmitText = exportSubmitBtn.querySelector('.export-submit-text');
      const exportSubmitLoading = exportSubmitBtn.querySelector('.export-submit-loading');
      
      exportSubmitBtn.disabled = false;
      if (exportSubmitText) exportSubmitText.style.display = 'inline-flex';
      if (exportSubmitLoading) exportSubmitLoading.style.display = 'none';
    }
  }
}
