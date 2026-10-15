import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installGlobalErrorReporting } from './utils/reportError';

installGlobalErrorReporting();

// Application installable + « Mes billets » hors connexion (production uniquement).
if ((import.meta as any).env?.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* site utilisable sans */ });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);