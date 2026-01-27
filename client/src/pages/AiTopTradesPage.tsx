import React, { useState, useEffect, useCallback } from 'react';

interface TopTradeRecommendation {
  symbol: string;
  direction: 'long' | 'short';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  entry: number;
  stopLoss: number;
  target: number;
  rank: number;
}

interface AiTopTradesResult {
  timestamp: string;
  recommendations: TopTradeRecommendation[];
  executedTrades: string[];
  skippedTrades: string[];
  error?: string;
}

interface ServiceStatus {
  success: boolean;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastResult: AiTopTradesResult | null;
  isRunning: boolean;
}

const getBaseUrl = (): string => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5002';
  }
  return '';
};

const AiTopTradesPage: React.FC = () => {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/ai-top-trades/status`);
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch service status');
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${getBaseUrl()}/api/ai-top-trades/start`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to start service');
      await fetchStatus();
    } catch (err) {
      setError('Failed to start service');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${getBaseUrl()}/api/ai-top-trades/stop`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to stop service');
      await fetchStatus();
    } catch (err) {
      setError('Failed to stop service');
    } finally {
      setLoading(false);
    }
  };

  const handleTrigger = async () => {
    setTriggerLoading(true);
    try {
      const response = await fetch(`${getBaseUrl()}/api/ai-top-trades/trigger`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to trigger scan');
      await fetchStatus();
    } catch (err) {
      setError('Failed to trigger manual scan');
    } finally {
      setTriggerLoading(false);
    }
  };

  const formatTime = (isoString: string | null): string => {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getConfidenceColor = (confidence: string): string => {
    switch (confidence) {
      case 'high': return '#22c55e';
      case 'medium': return '#f59e0b';
      case 'low': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getDirectionColor = (direction: string): string => {
    return direction === 'long' ? '#22c55e' : '#ef4444';
  };

  return (
    <div className="ai-top-trades-page" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>AI Top 5 Trades</h1>
        <p style={{ color: '#6b7280' }}>
          Automated AI-powered trade recommendations every 15 minutes (3pm-7:30pm UK)
        </p>
      </div>

      {error && (
        <div style={{ 
          backgroundColor: '#fef2f2', 
          border: '1px solid #ef4444', 
          borderRadius: '8px', 
          padding: '12px', 
          marginBottom: '16px',
          color: '#dc2626'
        }}>
          {error}
        </div>
      )}

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '16px', 
        marginBottom: '24px' 
      }}>
        <div style={{ 
          backgroundColor: '#f9fafb', 
          borderRadius: '8px', 
          padding: '16px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Service Status</div>
          <div style={{ 
            fontSize: '18px', 
            fontWeight: 'bold',
            color: status?.enabled ? '#22c55e' : '#ef4444'
          }}>
            {status?.enabled ? 'Running' : 'Stopped'}
          </div>
        </div>

        <div style={{ 
          backgroundColor: '#f9fafb', 
          borderRadius: '8px', 
          padding: '16px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Last Run</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {formatTime(status?.lastRun || null)}
          </div>
        </div>

        <div style={{ 
          backgroundColor: '#f9fafb', 
          borderRadius: '8px', 
          padding: '16px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Next Run</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {formatTime(status?.nextRun || null)}
          </div>
        </div>

        <div style={{ 
          backgroundColor: '#f9fafb', 
          borderRadius: '8px', 
          padding: '16px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Scan Status</div>
          <div style={{ 
            fontSize: '18px', 
            fontWeight: 'bold',
            color: status?.isRunning ? '#f59e0b' : '#6b7280'
          }}>
            {status?.isRunning ? 'Scanning...' : 'Idle'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {status?.enabled ? (
          <button
            onClick={handleStop}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Stopping...' : 'Stop Service'}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Starting...' : 'Start Service'}
          </button>
        )}

        <button
          onClick={handleTrigger}
          disabled={triggerLoading || status?.isRunning}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: (triggerLoading || status?.isRunning) ? 'not-allowed' : 'pointer',
            opacity: (triggerLoading || status?.isRunning) ? 0.6 : 1
          }}
        >
          {triggerLoading ? 'Scanning...' : 'Trigger Manual Scan'}
        </button>

        <button
          onClick={fetchStatus}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Refresh
        </button>
      </div>

      {status?.lastResult && (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
            Last Scan Results
            <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#6b7280', marginLeft: '12px' }}>
              {formatTime(status.lastResult.timestamp)}
            </span>
          </h2>

          {status.lastResult.error && (
            <div style={{ 
              backgroundColor: '#fef3c7', 
              border: '1px solid #f59e0b', 
              borderRadius: '8px', 
              padding: '12px', 
              marginBottom: '16px',
              color: '#92400e'
            }}>
              {status.lastResult.error}
            </div>
          )}

          {status.lastResult.recommendations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {status.lastResult.recommendations.map((rec, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    borderLeft: `4px solid ${getDirectionColor(rec.direction)}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ 
                        fontSize: '20px', 
                        fontWeight: 'bold',
                        color: '#374151'
                      }}>
                        #{rec.rank} {rec.symbol}
                      </span>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: getDirectionColor(rec.direction),
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                      }}>
                        {rec.direction}
                      </span>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: getConfidenceColor(rec.confidence),
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {rec.confidence}
                      </span>
                    </div>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(3, 1fr)', 
                    gap: '16px',
                    marginBottom: '8px'
                  }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Entry</div>
                      <div style={{ fontWeight: 'bold' }}>${rec.entry.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Stop Loss</div>
                      <div style={{ fontWeight: 'bold', color: '#ef4444' }}>${rec.stopLoss.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Target</div>
                      <div style={{ fontWeight: 'bold', color: '#22c55e' }}>${rec.target.toFixed(2)}</div>
                    </div>
                  </div>

                  <div style={{ fontSize: '14px', color: '#4b5563' }}>
                    {rec.reasoning}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ 
              backgroundColor: '#f9fafb', 
              borderRadius: '8px', 
              padding: '24px', 
              textAlign: 'center',
              color: '#6b7280'
            }}>
              No recommendations from the last scan
            </div>
          )}

          {(status.lastResult.executedTrades.length > 0 || status.lastResult.skippedTrades.length > 0) && (
            <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px', color: '#22c55e' }}>
                  Executed ({status.lastResult.executedTrades.length})
                </h3>
                {status.lastResult.executedTrades.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {status.lastResult.executedTrades.map((trade, i) => (
                      <li key={i} style={{ padding: '4px 0', fontSize: '14px' }}>{trade}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: '#6b7280', fontSize: '14px' }}>None</div>
                )}
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px', color: '#ef4444' }}>
                  Skipped ({status.lastResult.skippedTrades.length})
                </h3>
                {status.lastResult.skippedTrades.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {status.lastResult.skippedTrades.map((trade, i) => (
                      <li key={i} style={{ padding: '4px 0', fontSize: '14px' }}>{trade}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: '#6b7280', fontSize: '14px' }}>None</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!status?.lastResult && (
        <div style={{ 
          backgroundColor: '#f9fafb', 
          borderRadius: '8px', 
          padding: '48px', 
          textAlign: 'center',
          color: '#6b7280'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>No scan results yet</div>
          <div style={{ fontSize: '14px' }}>
            Start the service or trigger a manual scan to see AI trade recommendations
          </div>
        </div>
      )}
    </div>
  );
};

export default AiTopTradesPage;
