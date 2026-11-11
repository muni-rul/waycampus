import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import './index.css'

// Development-only: validate the campus panorama navigation graph on startup
if (import.meta.env.DEV) {
  import('./data/campusGraphValidation').then(({ printValidationReport }) => {
    printValidationReport();
  });
}

// Register PWA Service Worker for offline capability & instant caching (only in production or valid SSL)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => console.log('[CampNav PWA] Service worker registered:', reg.scope),
      (err) => console.warn('[CampNav PWA] Service worker registration failed:', err)
    );
  });
}

// Disable right-click context menu and dev tools shortcuts in production
if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
      (e.ctrlKey && e.key === 'U')
    ) {
      e.preventDefault();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
