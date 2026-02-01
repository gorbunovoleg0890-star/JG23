import React from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

// Global error state for non-render errors
window.__appErrorState = {
  error: null,
  errorSource: 'render', // 'render', 'global', or 'unhandledRejection'
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    const storedError = this.getStoredError();
    this.state = {
      hasError: !!storedError,
      error: storedError || null,
      errorInfo: null,
      errorSource: storedError ? 'stored' : 'none',
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Store error info in state
    this.setState({
      error,
      errorInfo,
      errorSource: 'render',
    });

    // Store in localStorage for persistence across reloads
    this.storeError({
      message: error.toString(),
      stack: error.stack || '',
      source: 'render',
      timestamp: new Date().toISOString(),
    });

    // Store in global state
    window.__appErrorState = {
      error,
      errorInfo,
      errorSource: 'render',
    };

    // Log to console for development
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  getStoredError() {
    try {
      const stored = localStorage.getItem('__last_error__');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse stored error:', e);
    }
    return null;
  }

  storeError(errorObj) {
    try {
      localStorage.setItem('__last_error__', JSON.stringify(errorObj));
    } catch (e) {
      console.warn('Failed to store error in localStorage:', e);
    }
  }

  clearErrorAndReload = () => {
    try {
      localStorage.removeItem('__last_error__');
    } catch (e) {
      console.warn('Failed to clear error:', e);
    }
    window.location.reload();
  };

  clearAllDataAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Failed to clear storage:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errorDisplay = this.state.error || this.state.errorInfo;
      const errorMessage = this.state.error?.message || this.state.error?.toString() || 'Unknown error';
      const errorStack = this.state.error?.stack || (this.state.errorInfo?.componentStack) || '';

      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0f1729',
          color: '#e0e7ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <div style={{
            maxWidth: '800px',
            width: '100%',
            backgroundColor: '#1a2847',
            borderRadius: '12px',
            border: '1px solid #3b4d7d',
            padding: '40px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '24px',
            }}>
              <AlertTriangle size={32} style={{ color: '#ef4444' }} />
              <h1 style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: '#fff',
                margin: 0,
              }}>
                Ошибка приложения
              </h1>
            </div>

            {/* Error source indicator */}
            <div style={{
              backgroundColor: '#1f2d4a',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#cbd5e1',
            }}>
              Источник: <span style={{ color: '#fbbf24' }}>{this.state.errorSource || 'unknown'}</span>
              {this.state.error?.timestamp && (
                <span style={{ marginLeft: '16px', color: '#94a3b8' }}>
                  Время: {new Date(this.state.error.timestamp).toLocaleString('ru-RU')}
                </span>
              )}
            </div>

            {/* Error message */}
            <div style={{
              backgroundColor: '#1f2d4a',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '20px',
              borderLeft: '4px solid #ef4444',
            }}>
              <div style={{ fontSize: '14px', color: '#fecaca', fontWeight: '500' }}>
                {errorMessage}
              </div>
            </div>

            {/* Stack trace */}
            {errorStack && (
              <div style={{
                backgroundColor: '#0f1729',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '24px',
                overflow: 'auto',
              }}>
                <div style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  fontFamily: '"Courier New", monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {errorStack}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{
              display: 'flex',
              gap: '12px',
              flexDirection: 'column',
            }}>
              <button
                onClick={this.clearErrorAndReload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#2563eb'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#3b82f6'}
              >
                <RotateCcw size={16} />
                Перезагрузить страницу
              </button>

              <button
                onClick={this.clearAllDataAndReload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#dc2626'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#ef4444'}
              >
                <Trash2 size={16} />
                Сбросить данные и перезагрузить
              </button>
            </div>

            {/* Footer info */}
            <div style={{
              marginTop: '24px',
              padding: '12px',
              backgroundColor: '#1f2d4a',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#94a3b8',
              textAlign: 'center',
            }}>
              Если проблема повторяется, попробуйте очистить данные браузера или обратитесь в поддержку.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
