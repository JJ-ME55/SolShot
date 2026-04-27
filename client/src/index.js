import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Note: fetchWalletButtons 403 suppression is handled in public/js/suppress-wallet-errors.js
// which runs before the webpack bundle (and before CRA registers its error overlay listener).

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA (production only)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((_reg) => {
      })
      .catch((err) => {
        console.warn('[SolShot] Service worker registration failed:', err);
      });
  });
}
