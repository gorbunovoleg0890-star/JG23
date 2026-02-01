import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './index.css';

// ==================== Global Error Handlers ====================

// Initialize global error state
window.__appErrorState = {
  error: null,
  errorSource: 'none',
};

// Handle synchronous errors
window.addEventListener('error', (event) => {
  const errorObj = {
    message: event.message || 'Unknown error',
    filename: event.filename || '',
    lineno: event.lineno || '',
    colno: event.colno || '',
    stack: event.error?.stack || '',
    source: 'global',
    timestamp: new Date().toISOString(),
  };

  // Store in localStorage
  try {
    localStorage.setItem('__last_error__', JSON.stringify(errorObj));
  } catch (e) {
    console.warn('Failed to store error in localStorage:', e);
  }

  // Store in global state
  window.__appErrorState = {
    error: event.error,
    errorSource: 'global',
  };

  console.error('Global error handler caught:', errorObj);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const errorObj = {
    message: event.reason?.message || String(event.reason) || 'Unhandled Promise Rejection',
    stack: event.reason?.stack || '',
    source: 'unhandledRejection',
    timestamp: new Date().toISOString(),
  };

  // Store in localStorage
  try {
    localStorage.setItem('__last_error__', JSON.stringify(errorObj));
  } catch (e) {
    console.warn('Failed to store error in localStorage:', e);
  }

  // Store in global state
  window.__appErrorState = {
    error: event.reason,
    errorSource: 'unhandledRejection',
  };

  console.error('Unhandled rejection:', errorObj);
});

// ==================== React Render ====================

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
