import React, { useState, useEffect } from 'react';
import '../styles/CircuitBreakerDashboard.css';

interface RiskMetrics {
  dailyPnL: number;
  dailyPnLPercent: number;
  consecutiveLosses: number;
  accountBalance: number;
}

interface CircuitBreakerStatus {
  isActive: boolean;
  reason?: string;
  triggeredAt?: Date;
  willResetAt?: Date;
}

interface TodaysStats {
  totalTrades: number;
  openPositions: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
}

interface RecentTrade {
  time: string;
  symbol: string;
  pattern: string;
  status: string;
  pnl?: number;
  exitReason?: string;
}

interface DashboardData {
  date: string;
  circuitBreakerActive: boolean;
  circuitBreakerReason?: string;
  riskMetrics: RiskMetrics | null;
  todaysStats: TodaysStats;
  recentTrades: RecentTrade[];
  triggers: any[];
}

const CircuitBreakerDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState<CircuitBreakerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds default

  // Fetch dashboard data
  const fetchDashboard = async () => {
    try {
      const response = await fetch('http://localhost:5002/api/circuit-breaker/dashboard');
      if (!response.ok) throw new Error('Failed to fetch dashboard');
      const data = await response.json();
      setDashboardData(data);
      setError(null);
    } catch (err) {
      console.error('Dashboard error:', err);
      setError('Failed to load dashboard data');
    }
  };

  // Fetch circuit breaker status
  const fetchStatus = async () => {
    try {
      const response = await fetch('http://localhost:5002/api/mt5/circuit-breaker/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setCircuitBreakerStatus(data.circuitBreaker);
    } catch (err) {
      console.error('Status error:', err);
    }
  };

  // Emergency stop
  const handleEmergencyStop = async () => {
    const reason = prompt('Enter reason for emergency stop:');
    if (!reason) return;

    try {
      const response = await fetch('http://localhost:5002/api/mt5/circuit-breaker/emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      
      if (response.ok) {
        alert('Emergency stop activated!');
        fetchDashboard();
        fetchStatus();
      }
    } catch (err) {
      alert('Failed to activate emergency stop');
    }
  };

  // Reset circuit breaker
  const handleReset = async (force: boolean = false) => {
    try {
      const response = await fetch('http://localhost:5002/api/mt5/circuit-breaker/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });
      
      const data = await response.json();
      if (response.ok) {
        alert('Circuit breaker reset!');
        fetchDashboard();
        fetchStatus();
      } else {
        alert(data.error || 'Failed to reset');
      }
    } catch (err) {
      alert('Failed to reset circuit breaker');
    }
  };

  // Test trade simulation
  const simulateLosingTrade = async () => {
    try {
      const response = await fetch('http://localhost:5002/api/mt5/validate-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `test-${Date.now()}`,
          symbol: 'TEST',
          pattern: { name: 'Test Pattern', direction: 'bullish' },
          plan: { direction: 'long', entry: 100, stop: 98, targets: [102] },
          score: 80
        })
      });
      
      const data = await response.json();
      alert(`Signal validation: ${data.success ? 'Approved' : 'Blocked - ' + data.reason}`);
      fetchDashboard();
    } catch (err) {
      alert('Failed to simulate trade');
    }
  };

  useEffect(() => {
    fetchDashboard();
    fetchStatus();
    setLoading(false);

    // Auto-refresh
    const interval = setInterval(() => {
      fetchDashboard();
      fetchStatus();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  if (loading) return <div className="circuit-breaker-dashboard loading">Loading...</div>;
  if (error) return <div className="circuit-breaker-dashboard error">{error}</div>;

  const metrics = dashboardData?.riskMetrics;
  const stats = dashboardData?.todaysStats;
  const isActive = dashboardData?.circuitBreakerActive || false;

  return (
    <div className="circuit-breaker-dashboard">
      <div className="dashboard-header">
        <h1>Circuit Breaker Monitor</h1>
        <div className="refresh-controls">
          <label>
            Auto-refresh: 
            <select value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))}>
              <option value={0}>Off</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
            </select>
          </label>
          <button onClick={() => { fetchDashboard(); fetchStatus(); }}>Refresh Now</button>
        </div>
      </div>

      {/* Circuit Breaker Status */}
      <div className={`status-banner ${isActive ? 'active' : 'inactive'}`}>
        <div className="status-icon">{isActive ? '🛑' : '✅'}</div>
        <div className="status-text">
          <h2>Circuit Breaker: {isActive ? 'ACTIVE' : 'INACTIVE'}</h2>
          {isActive && dashboardData?.circuitBreakerReason && (
            <p>{dashboardData.circuitBreakerReason}</p>
          )}
        </div>
        <div className="status-actions">
          {!isActive && (
            <button className="emergency-stop" onClick={handleEmergencyStop}>
              🚨 Emergency Stop
            </button>
          )}
          {isActive && (
            <>
              <button onClick={() => handleReset(false)}>Try Reset</button>
              <button onClick={() => handleReset(true)}>Force Reset</button>
            </>
          )}
        </div>
      </div>

      {/* Risk Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Daily P&L</h3>
          <div className={`metric-value ${(metrics?.dailyPnL || 0) < 0 ? 'negative' : 'positive'}`}>
            ${metrics?.dailyPnL?.toFixed(2) || '0.00'}
            <span className="metric-percent">
              ({metrics?.dailyPnLPercent?.toFixed(2) || '0.00'}%)
            </span>
          </div>
        </div>

        <div className="metric-card">
          <h3>Consecutive Losses</h3>
          <div className={`metric-value ${(metrics?.consecutiveLosses || 0) >= 3 ? 'warning' : ''}`}>
            {metrics?.consecutiveLosses || 0}
            <span className="metric-limit">/5</span>
          </div>
        </div>

        <div className="metric-card">
          <h3>Open Positions</h3>
          <div className="metric-value">
            {stats?.openPositions || 0}
            <span className="metric-limit">/10</span>
          </div>
        </div>

        <div className="metric-card">
          <h3>Today's Trades</h3>
          <div className="metric-value">
            {stats?.totalTrades || 0}
            <span className="metric-detail">
              ({stats?.winningTrades || 0}W/{stats?.losingTrades || 0}L)
            </span>
          </div>
        </div>
      </div>

      {/* Recent Triggers */}
      {dashboardData?.triggers && dashboardData.triggers.length > 0 && (
        <div className="triggers-section">
          <h3>Recent Triggers</h3>
          <div className="triggers-list">
            {dashboardData.triggers.map((trigger, idx) => (
              <div key={idx} className="trigger-item">
                <span className="trigger-type">{trigger.type}</span>
                <span className="trigger-message">{trigger.message}</span>
                <span className="trigger-time">
                  {new Date(trigger.triggeredAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Trades */}
      <div className="trades-section">
        <h3>Recent Trades</h3>
        <div className="trades-table">
          <div className="table-header">
            <span>Time</span>
            <span>Symbol</span>
            <span>Pattern</span>
            <span>Status</span>
            <span>P&L</span>
            <span>Exit</span>
          </div>
          {dashboardData?.recentTrades.map((trade, idx) => (
            <div key={idx} className="table-row">
              <span>{new Date(trade.time).toLocaleTimeString()}</span>
              <span>{trade.symbol}</span>
              <span>{trade.pattern}</span>
              <span className={`status-${trade.status}`}>{trade.status}</span>
              <span className={trade.pnl && trade.pnl < 0 ? 'negative' : 'positive'}>
                {trade.pnl ? `$${trade.pnl.toFixed(2)}` : '-'}
              </span>
              <span>{trade.exitReason || '-'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Test Controls */}
      <div className="test-controls">
        <h3>Test Controls</h3>
        <button onClick={simulateLosingTrade}>Simulate Trade Validation</button>
      </div>
    </div>
  );
};

export default CircuitBreakerDashboard;