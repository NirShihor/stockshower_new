import React, { useState, useEffect, useRef } from 'react';

const getBaseUrl = (): string => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5001';
  }
  return '';
};

interface TradePlan {
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  risk: number;
  targets: number[];
  positionQty: number;
  riskRewardRatio: string;
}

interface PatternDetails {
  name: string;
  class: 'single' | 'double' | 'triple';
  direction: 'bullish' | 'bearish' | 'neutral';
  barsInvolved: number;
  patternHigh: number;
  patternLow: number;
}

interface MarketContext {
  trend: 'up' | 'down' | 'sideways';
  atSupport: boolean;
  atResistance: boolean;
  nearestSupport?: number;
  nearestResistance?: number;
  atr: number;
  volumeFactor: number;
  isHighVolume: boolean;
  isWideRange: boolean;
}

interface ConfirmationPlan {
  triggerSide: 'above_high' | 'below_low';
  triggerPrice: number;
  invalidationPrice: number;
  validForBars: number;
}

interface ComprehensiveSignal {
  id: string;
  symbol: string;
  timeframe: string;
  time: string;
  pattern: PatternDetails;
  context: MarketContext;
  confirmation: ConfirmationPlan;
  plan: TradePlan;
  score: number;
  notes: string[];
}

// Legacy interface for compatibility
interface Signal {
  // Comprehensive signal fields (may not always be present)
  id: string;
  symbol: string;
  timeframe?: string;
  time?: string;
  pattern?: PatternDetails;
  context?: MarketContext;
  confirmation?: ConfirmationPlan;
  plan?: TradePlan;
  score?: number;
  notes?: string[];
  
  // Legacy fields
  type?: string;
  at?: string;
  meta?: any;
  orderSuggestion?: any;
}

const DEFAULT_WATCHLIST = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM',
  'V', 'JNJ', 'WMT', 'PG', 'DIS', 'HD', 'MA', 'PYPL', 'BAC', 'ADBE',
  'NFLX', 'CRM', 'PFE', 'TMO', 'CSCO', 'PEP', 'ABT', 'NKE', 'ORCL',
  'CVX', 'KO', 'CMCSA', 'XOM', 'VZ', 'INTC', 'WFC', 'T', 'UNH',
  'MRK', 'BA', 'MMM'
];

const StockScanPage: React.FC = () => {
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [customSymbol, setCustomSymbol] = useState('');
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish'>('all');
  const [testMode, setTestMode] = useState(false);
  const [mockRunning, setMockRunning] = useState(false);
  const [realDataEnabled, setRealDataEnabled] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Sound alert when new signal detected  
  const playAlert = () => {
    // Temporarily disabled - testing if sound changes work
    console.log('🎵 New pattern detected (sound temporarily disabled)');
    
    // Uncomment when ready to test new sound:
    // const audio = new Audio('data:audio/wav;base64,UklGRh4CAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YfoAAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCTGH0fPTgjMGHm7A7+OZURE');
    // audio.volume = 0.2;
    // audio.play().catch(e => console.log('Audio play failed:', e));
  };

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      const wsUrl = getBaseUrl().replace('http', 'ws') + '/ws';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setConnected(true);
        // Only subscribe if real data is enabled
        if (realDataEnabled && watchlist.length > 0) {
          await fetch(`${getBaseUrl()}/api/candlestick/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: watchlist, granularity: 'AM' })
          });
          setScanning(true);
        }
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'signal') {
          setSignals(prev => {
            // Check if this signal ID already exists
            if (prev.some(s => s.id === message.payload.id)) {
              return prev;
            }
            
            const newSignals = [message.payload, ...prev].slice(0, 100); // Keep last 100 signals
            
            // Play alert for new signal
            if (prev.length > 0) {
              playAlert();
            }
            
            return newSignals;
          });
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setScanning(false);
        wsRef.current = null;
        // Reconnect after 2 seconds
        setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        // Only unsubscribe if real data was enabled
        if (realDataEnabled) {
          fetch(`${getBaseUrl()}/api/candlestick/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: watchlist, granularity: 'AM' })
          }).catch(console.error);
        }
        
        wsRef.current.close();
      }
    };
  }, []);

  // Update subscriptions when watchlist changes and real data is enabled
  useEffect(() => {
    if (connected && wsRef.current && realDataEnabled) {
      // Unsubscribe from all first
      fetch(`${getBaseUrl()}/api/candlestick/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: DEFAULT_WATCHLIST.concat(watchlist), granularity: 'AM' })
      }).then(() => {
        // Subscribe to new watchlist
        if (watchlist.length > 0) {
          return fetch(`${getBaseUrl()}/api/candlestick/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: watchlist, granularity: 'AM' })
          });
        }
      }).then(() => {
        setScanning(watchlist.length > 0 && realDataEnabled);
      }).catch(console.error);
    }
  }, [watchlist, connected, realDataEnabled]);

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = customSymbol.trim().toUpperCase();
    if (symbol && !watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol]);
      setCustomSymbol('');
    }
  };

  const handleRemoveSymbol = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  const formatSignalTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const filteredSignals = signals.filter(signal => {
    if (filter === 'all') return true;
    // Check both new format and legacy format
    const direction = signal.pattern?.direction || (signal.type?.includes('bullish') ? 'bullish' : signal.type?.includes('bearish') ? 'bearish' : 'neutral');
    if (filter === 'bullish') return direction === 'bullish';
    if (filter === 'bearish') return direction === 'bearish';
    return true;
  });

  const startMockData = async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/candlestick/test/mock/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setMockRunning(true);
        setScanning(true);
        console.log('Mock data feed started');
      }
    } catch (error) {
      console.error('Failed to start mock data:', error);
    }
  };

  const stopMockData = async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/candlestick/test/mock/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setMockRunning(false);
        if (!realDataEnabled) {
          setScanning(false);
        }
        console.log('Mock data feed stopped');
      }
    } catch (error) {
      console.error('Failed to stop mock data:', error);
    }
  };

  const startRealData = async () => {
    if (connected && watchlist.length > 0) {
      await fetch(`${getBaseUrl()}/api/candlestick/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: watchlist, granularity: 'AM' })
      });
      setRealDataEnabled(true);
      setScanning(true);
    }
  };

  const stopRealData = async () => {
    if (connected) {
      await fetch(`${getBaseUrl()}/api/candlestick/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: watchlist, granularity: 'AM' })
      });
      setRealDataEnabled(false);
      if (!mockRunning) {
        setScanning(false);
      }
    }
  };

  return (
    <div className="stock-scan-page">
      <div className="page-header">
        <h1 className="page-title">Real-Time Pattern Scanner (5m)</h1>
        <div className="scanner-status">
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className={`scanning-indicator ${scanning ? 'active' : ''}`}>
            {scanning ? `Scanning ${watchlist.length} stocks (5m candles)` : 'Not scanning'}
          </span>
        </div>
      </div>

      <div className="scanner-controls">
        <div className="watchlist-section">
          <h3>Watchlist ({watchlist.length} stocks)</h3>
          <form onSubmit={handleAddSymbol} className="add-symbol-form">
            <input
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value)}
              placeholder="Add symbol..."
              className="symbol-input"
            />
            <button type="submit" className="add-button">Add</button>
          </form>
          <div className="watchlist-chips">
            {watchlist.map(symbol => (
              <span key={symbol} className="symbol-chip">
                {symbol}
                <button
                  onClick={() => handleRemoveSymbol(symbol)}
                  className="remove-chip"
                  aria-label={`Remove ${symbol}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="data-controls">
          <div className="control-buttons">
            <button
              className={`control-button ${realDataEnabled ? 'stop' : 'start'}`}
              onClick={realDataEnabled ? stopRealData : startRealData}
              disabled={!connected}
            >
              {realDataEnabled ? 'Stop Real Data' : 'Start Real Data'}
            </button>
          </div>
          {realDataEnabled && (
            <div className="data-status">
              Receiving live data
            </div>
          )}
          {!connected && (
            <div className="connection-warning">
              Waiting for connection...
            </div>
          )}
        </div>

        <div className="filter-section">
          <label>Filter signals:</label>
          <div className="filter-buttons">
            <button
              className={`filter-button ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({signals.length})
            </button>
            <button
              className={`filter-button ${filter === 'bullish' ? 'active' : ''}`}
              onClick={() => setFilter('bullish')}
            >
              Bullish ({signals.filter(s => {
                const direction = s.pattern?.direction || (s.type?.includes('bullish') ? 'bullish' : 'neutral');
                return direction === 'bullish';
              }).length})
            </button>
            <button
              className={`filter-button ${filter === 'bearish' ? 'active' : ''}`}
              onClick={() => setFilter('bearish')}
            >
              Bearish ({signals.filter(s => {
                const direction = s.pattern?.direction || (s.type?.includes('bearish') ? 'bearish' : 'neutral');
                return direction === 'bearish';
              }).length})
            </button>
          </div>
        </div>

        <div className="test-section">
          <label>
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => {
                setTestMode(e.target.checked);
                // If unchecking test mode while mock is running, stop it
                if (!e.target.checked && mockRunning) {
                  stopMockData();
                }
              }}
            />
            Test Mode (Mock Data)
          </label>
          {testMode && (
            <div className="test-controls">
              <p className="test-info">
                Use mock data to test pattern detection. Mock data generates 1-minute candles that are aggregated into 5-minute candles.
              </p>
              <div className="test-buttons">
                <button
                  className={`test-button ${mockRunning ? 'stop' : 'start'}`}
                  onClick={mockRunning ? stopMockData : startMockData}
                >
                  {mockRunning ? 'Stop Mock Data' : 'Start Mock Data'}
                </button>
                {mockRunning && (
                  <span className="mock-status">
                    Mock feed running - patterns should appear when 5-minute candles complete
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="signals-container">
        <h2>Pattern Alerts</h2>
        {filteredSignals.length === 0 ? (
          <div className="no-signals">
            {scanning ? 'Scanning for patterns... Alerts will appear here.' : 'Add stocks to watchlist to start scanning.'}
          </div>
        ) : (
          <div className="signals-grid">
            {filteredSignals.map(signal => {
              const patternName = signal.pattern?.name || (typeof signal.type === 'string' ? signal.type.replace('_', ' ') : 'Unknown Pattern');
              const patternDirection = signal.pattern?.direction || 'neutral';
              const timestamp = signal.time || signal.at || new Date().toISOString();
              const score = signal.score || 0;
              
              return (
                <div key={signal.id} className={`signal-card ${patternDirection}`}>
                  <div className="signal-header">
                    <div className="signal-symbol-wrapper">
                      <span className="signal-symbol">{signal.symbol}</span>
                      {signal.score && (
                        <span className={`signal-score ${signal.score >= 70 ? 'high' : signal.score >= 50 ? 'medium' : 'low'}`}>
                          {signal.score}
                        </span>
                      )}
                    </div>
                    <span className="signal-time">{formatSignalTime(timestamp)}</span>
                  </div>
                  
                  <div className="signal-pattern">
                    <div className="pattern-name">{patternName}</div>
                    {signal.pattern && (
                      <div className="pattern-info">
                        <span className="pattern-class">{signal.pattern.class}</span>
                        <span className="pattern-direction">{signal.pattern.direction}</span>
                      </div>
                    )}
                  </div>

                  {signal.context && (
                    <div className="market-context">
                      <div className="context-row">
                        <span>Trend: {signal.context.trend}</span>
                        {signal.context.isHighVolume && <span className="volume-spike">📈 Volume</span>}
                      </div>
                      {(signal.context.atSupport || signal.context.atResistance) && (
                        <div className="context-row">
                          <span className="sr-level">
                            {signal.context.atSupport ? '📊 At Support' : '📊 At Resistance'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {signal.plan && (
                    <div className="trade-plan">
                      <div className="plan-header">
                        <span className="plan-title">Trade Plan ({signal.plan.direction.toUpperCase()})</span>
                      </div>
                      <div className="plan-details">
                        <div className="plan-row">
                          <span className="plan-label">Entry:</span>
                          <span className="plan-value">${signal.plan.entry}</span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">Stop:</span>
                          <span className="plan-value">${signal.plan.stop}</span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">Targets:</span>
                          <span className="plan-value">{signal.plan.targets.map(t => `$${t}`).join(', ')}</span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">Risk:</span>
                          <span className="plan-value">${signal.plan.risk}</span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">Qty:</span>
                          <span className="plan-value">{signal.plan.positionQty} shares</span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">R:R:</span>
                          <span className="plan-rr">{signal.plan.riskRewardRatio}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {signal.notes && signal.notes.length > 0 && (
                    <div className="signal-notes">
                      {signal.notes.map((note, index) => (
                        <div key={index} className="note-item">{note}</div>
                      ))}
                    </div>
                  )}

                  <button 
                    className="view-chart-button"
                    onClick={() => window.open(`/charts?symbol=${signal.symbol}`, '_blank')}
                  >
                    View Chart
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StockScanPage;