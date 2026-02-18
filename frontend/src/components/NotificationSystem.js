import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { getUserTransactions, getAuthToken } from '../api';
// FIX: import getAuthToken from api.js so the 401 check reads from the same
//      sessionStorage key that login writes to, instead of localStorage.

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications]             = useState([]);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);

  const addNotification = useCallback((notification) => {
    const id = Date.now() + Math.random();
    const newNotification = {
      id,
      timestamp: new Date(),
      read: false,
      ...notification
    };

    setNotifications(prev => [newNotification, ...prev]);

    // Auto-remove non-persistent notifications after 10 s
    if (notification.type !== 'delayed_transaction') {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 10000);
    }
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const markAsRead = useCallback((id) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  // Poll for delayed transactions (only while authenticated)
  useEffect(() => {
    // FIX: was reading from localStorage.getItem('fdt_token') while the token
    //      lives in sessionStorage – so this guard always bailed out early and
    //      the interval was never started, yet when it DID fire (e.g. after a
    //      page reload where sessionStorage was still populated) the request
    //      lacked a token and returned 401.  Using getAuthToken() ensures we
    //      read from the correct store.
    const token = getAuthToken();
    if (!token) return;

    const checkDelayedTransactions = async () => {
      try {
        const data        = await getUserTransactions(20, 'DELAY');
        const delayedTxns = data.transactions || [];

        delayedTxns.forEach(tx => {
          const existingNotification = notifications.find(
            n =>
              n.type          === 'delayed_transaction' &&
              n.transactionId === tx.tx_id &&
              n.read          === false
          );

          if (!existingNotification) {
            addNotification({
              type:          'delayed_transaction',
              title:         'Transaction Pending Verification',
              message:       `Transaction of ₹${tx.amount} to ${tx.recipient_vpa} needs your confirmation`,
              transactionId: tx.tx_id,
              action:        'review',
              actionText:    'Review Now',
              actionUrl:     `/fraud-alert/${tx.tx_id}`
            });
          }
        });
      } catch (err) {
        console.error('Failed to check delayed transactions:', err);
        // 401s are already handled globally by the axios interceptor in api.js
        // (it clears the token and redirects to /login), so no extra handling needed here.
      }
    };

    // Check immediately, then every 30 s
    checkDelayedTransactions();
    const interval = setInterval(checkDelayedTransactions, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addNotification]);
  // FIX: removed `notifications` from the dependency array – it was causing
  //      a new interval to be registered on every state change (i.e. every
  //      time a notification was added/removed), leading to rapid-fire requests
  //      that all came back 401 because the interceptor had already wiped the
  //      token on the first failure.

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        markAsRead,
        clearAll,
        showNotificationPanel,
        setShowNotificationPanel,
        unreadCount
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
