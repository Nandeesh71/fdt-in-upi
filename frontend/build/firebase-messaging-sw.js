// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config loaded from environment
// Note: Service workers cannot access process.env, so config must be injected at build time
firebase.initializeApp({
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title || 'FDT Fraud Alert';
  const notificationOptions = {
    body: payload.notification.body || 'Suspicious transaction detected',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: 'fraud-alert',
    requireInteraction: true
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
