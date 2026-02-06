import React, { useState, useEffect, useRef } from 'react';

const getBaseUrl = (): string => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5002';
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
  currentPrice?: number;
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
  currentPrice?: number;
  trapRisk?: 'none' | 'low' | 'medium' | 'high';
  
  // Legacy fields
  type?: string;
  at?: string;
  meta?: any;
  orderSuggestion?: any;
}

const DEFAULT_WATCHLIST = [
  // Mega Cap Tech (10)
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
  // Semiconductors (17)
  'AMD', 'INTC', 'QCOM', 'TXN', 'AMAT', 'LRCX', 'MU', 'MRVL', 'ON', 'SNPS', 'CDNS', 'KLAC', 'ASML', 'MCHP', 'SWKS', 'ARM', 'SMCI',
  // Software & Cloud (20)
  'ADBE', 'NOW', 'INTU', 'PANW', 'CRWD', 'SNOW', 'DDOG', 'NET', 'PLTR', 'SHOP', 'WDAY', 'TEAM', 'OKTA', 'ZS', 'FTNT', 'HUBS', 'DOCU', 'ZM', 'COIN', 'MSTR',
  // Internet & E-commerce (8)
  'NFLX', 'PYPL', 'ABNB', 'UBER', 'DASH', 'EBAY', 'ETSY', 'MELI',
  // Financials (15)
  'V', 'MA', 'JPM', 'BAC', 'GS', 'MS', 'BLK', 'SCHW', 'AXP', 'C', 'WFC', 'SPGI', 'MCO', 'CME', 'ICE',
  // Healthcare & Pharma (19)
  'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'GILD', 'VRTX', 'REGN', 'ISRG', 'MRNA', 'BIIB', 'ILMN', 'DXCM',
  // Consumer Discretionary (19)
  'HD', 'LOW', 'COST', 'WMT', 'TGT', 'NKE', 'SBUX', 'MCD', 'LULU', 'ROST', 'TJX', 'DG', 'DLTR', 'ORLY', 'AZO', 'CMG', 'DPZ', 'YUM', 'ULTA',
  // Consumer Staples (12)
  'PG', 'KO', 'PEP', 'PM', 'MO', 'CL', 'KHC', 'MDLZ', 'GIS', 'HSY', 'STZ', 'MNST',
  // Energy (12)
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'OXY', 'VLO', 'PSX', 'MPC', 'HAL', 'DVN',
  // Industrials (19)
  'CAT', 'DE', 'BA', 'HON', 'RTX', 'LMT', 'GD', 'NOC', 'GE', 'MMM', 'UPS', 'FDX', 'UNP', 'CSX', 'URI', 'EMR', 'ETN', 'ITW', 'PH',
  // Materials (7)
  'APD', 'SHW', 'ECL', 'NEM', 'FCX', 'NUE', 'SCCO',
  // REITs & Real Estate (10)
  'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'PSA', 'DLR', 'O', 'WELL', 'AVB',
  // Utilities (7)
  'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'XEL',
  // Telecom & Media (7)
  'T', 'VZ', 'TMUS', 'CMCSA', 'DIS', 'WBD', 'NWSA',
  // EV & Clean Energy (7)
  'RIVN', 'LCID', 'ENPH', 'SEDG', 'FSLR', 'RUN', 'PLUG',
  // Gaming & Entertainment (7)
  'EA', 'TTWO', 'RBLX', 'DKNG', 'PENN', 'MGM', 'LVS',
  // Aerospace & Defense (4)
  'AXON', 'HII', 'LHX', 'TDG',
  // Misc High Growth (18)
  'SOFI', 'HOOD', 'AFRM', 'UPST', 'APP', 'ROKU', 'TTD', 'BILL', 'PCTY', 'PAYC', 'VEEV', 'CPRT', 'ODFL', 'POOL', 'IDXX', 'PODD', 'ALGN', 'MKTX'
];

// Helper function to determine MT5 order type
const getMT5OrderType = (direction: 'long' | 'short', currentPrice: number, entryPrice: number): string => {
  if (direction === 'long') {
    // For long positions
    if (entryPrice > currentPrice) {
      return 'Buy Stop'; // Entry above current price
    } else {
      return 'Buy Limit'; // Entry below current price
    }
  } else {
    // For short positions
    if (entryPrice < currentPrice) {
      return 'Sell Stop'; // Entry below current price
    } else {
      return 'Sell Limit'; // Entry above current price
    }
  }
};

const StockScanPage: React.FC = () => {
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [connected, setConnected] = useState(false);
  const [polygonConnected, setPolygonConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [customSymbol, setCustomSymbol] = useState('');
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish'>('all');
  const [testMode, setTestMode] = useState(false);
  const [mockRunning, setMockRunning] = useState(false);
  const [mockSignalsRunning, setMockSignalsRunning] = useState(false);
  const [realDataEnabled, setRealDataEnabled] = useState(false);
  const [placingOrder, setPlacingOrder] = useState<string | null>(null); // Track which signal is being processed
  const [mt5Status, setMt5Status] = useState<{ connected: boolean; mt5Connected?: boolean } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.3);
  const wsRef = useRef<WebSocket | null>(null);

  // CAN SLIM Trading State
  const [canslimLoading, setCanslimLoading] = useState(false);
  const [canslimResult, setCanslimResult] = useState<any>(null);
  const [canslimDryRun, setCanslimDryRun] = useState(true);
  const [canslimForce, setCanslimForce] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [backendLogs, setBackendLogs] = useState<{timestamp: string; level: string; message: string}[]>([]);
  const [scanLogs, setScanLogs] = useState<{timestamp: string; level: string; message: string}[]>([]);
  const [serverLogs, setServerLogs] = useState<{timestamp: string; level: string; message: string}[]>([]);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [backendLogHeight, setBackendLogHeight] = useState(200);
  const [scanLogHeight, setScanLogHeight] = useState(200);
  const [serverLogHeight, setServerLogHeight] = useState(200);
  const backendLogRef = useRef<HTMLDivElement>(null);
  const scanLogRef = useRef<HTMLDivElement>(null);
  const serverLogRef = useRef<HTMLDivElement>(null);

  // Resize handlers for log windows
  const createResizeHandler = (setHeight: React.Dispatch<React.SetStateAction<number>>) => {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = (e.target as HTMLElement).parentElement?.querySelector('[data-log-content]')?.clientHeight || 200;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(100, Math.min(600, startHeight + deltaY));
        setHeight(newHeight);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
  };

  // Sound alert when new signal detected  
  const playAlert = () => {
    if (!soundEnabled) {
      console.log('🔇 Sound disabled - skipping alert');
      return;
    }
    
    console.log('🎵 New pattern detected - playing alert sound');
    
    // Use a softer, more pleasant notification sound
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCTGH0fPTgjMGHm7A7+OZTREMUKXi77RhGgc8ltf0y3wuBSN6yO/eizEIHm3A7+WXUhEKTKPr7K1bEw');
    audio.volume = soundVolume;
    audio.play().catch(e => console.log('Audio play failed:', e));
  };

  // WebSocket connection - DO NOT auto-connect
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
        // NO AUTO-RECONNECT - user must manually reconnect
        console.log('WebSocket closed - manual reconnection required');
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

  // WebSocket useEffect
  useEffect(() => {
    // DO NOT auto-connect on mount - wait for user action
    // connectWebSocket(); // REMOVED - manual connection only
    
    // DO NOT check Polygon status on mount - this triggers automatic connections
    // checkPolygonStatus(); // REMOVED - only check when user explicitly connects

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
      // Connect WebSocket first if not connected
      if (!connected) {
        console.log('Connecting WebSocket for mock data...');
        connectWebSocket();
        // Wait longer for connection to establish
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const response = await fetch(`${getBaseUrl()}/api/candlestick/test/mock/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setMockRunning(true);
        setScanning(true);
        console.log('Mock data feed started');
      } else {
        console.error('Failed to start mock data:', await response.text());
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

  const startMockSignals = async () => {
    try {
      // Connect WebSocket first if not connected
      if (!connected) {
        console.log('Connecting WebSocket for mock signals...');
        connectWebSocket();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const response = await fetch(`${getBaseUrl()}/api/candlestick/test/mock-signals/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setMockSignalsRunning(true);
        setScanning(true);
        console.log('Mock signals feed started');
      } else {
        console.error('Failed to start mock signals:', await response.text());
      }
    } catch (error) {
      console.error('Failed to start mock signals:', error);
    }
  };

  const stopMockSignals = async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/candlestick/test/mock-signals/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setMockSignalsRunning(false);
        if (!realDataEnabled && !mockRunning) {
          setScanning(false);
        }
        console.log('Mock signals feed stopped');
      }
    } catch (error) {
      console.error('Failed to stop mock signals:', error);
    }
  };

  const checkPolygonStatus = async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/candlestick/status`);
      if (response.ok) {
        const data = await response.json();
        setPolygonConnected(data.polygonConnected);
      }
    } catch (error) {
      console.error('Failed to check Polygon status:', error);
    }
  };

  const connectToPolygon = async () => {
    try {
      // First ensure WebSocket is connected
      if (!connected && !wsRef.current) {
        connectWebSocket();
        // Wait a bit for WebSocket to connect
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const response = await fetch(`${getBaseUrl()}/api/candlestick/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setPolygonConnected(true);
        console.log('Connected to Polygon');
        // Now check status after successful connection
        await checkPolygonStatus();
      } else {
        console.error('Failed to connect to Polygon:', await response.text());
      }
    } catch (error) {
      console.error('Failed to connect to Polygon:', error);
    }
  };

  const disconnectFromPolygon = async () => {
    try {
      // First stop real data if it's running
      if (realDataEnabled) {
        await stopRealData();
      }
      
      const response = await fetch(`${getBaseUrl()}/api/candlestick/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setPolygonConnected(false);
        console.log('Disconnected from Polygon');
      } else {
        console.error('Failed to disconnect from Polygon:', await response.text());
      }
    } catch (error) {
      console.error('Failed to disconnect from Polygon:', error);
    }
  };

  const startRealData = async () => {
    // Connect WebSocket first if not connected
    if (!connected && !wsRef.current) {
      connectWebSocket();
      // Wait a bit for connection
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (watchlist.length > 0) {
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
      // First unsubscribe from symbols
      await fetch(`${getBaseUrl()}/api/candlestick/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: watchlist, granularity: 'AM' })
      });
      
      // Then fully disconnect from Polygon WebSocket
      await fetch(`${getBaseUrl()}/api/candlestick/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      setRealDataEnabled(false);
      if (!mockRunning) {
        setScanning(false);
      }
    }
  };

  const checkMT5Status = async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/candlestick/mt5/status`);
      if (response.ok) {
        const status = await response.json();
        console.log('MT5 Status received:', status);
        setMt5Status(status);
        return status;
      }
    } catch (error) {
      console.error('Failed to check MT5 status:', error);
      const errorStatus = { connected: false };
      setMt5Status(errorStatus);
      return errorStatus;
    }
  };

  const handleFadePattern = async (signal: Signal) => {
    if (!signal.plan) {
      alert('This signal does not have a trading plan');
      return;
    }

    const confirmFade = window.confirm(
      `⚠️ FADE PATTERN TRADE ⚠️\n\n` +
      `You're about to trade OPPOSITE to the ${signal.pattern?.name || 'pattern'}.\n\n` +
      `Original: ${signal.plan.direction.toUpperCase()}\n` +
      `Fade Trade: ${signal.plan.direction === 'long' ? 'SHORT' : 'LONG'}\n\n` +
      `This is a contrarian trade betting the pattern will FAIL.\n\n` +
      `Continue with fade trade?`
    );

    if (!confirmFade) return;

    // Create a reversed signal for the fade trade
    const fadeSignal: Signal = {
      ...signal,
      id: signal.id + '-fade',
      pattern: {
        ...signal.pattern,
        name: `Fade ${signal.pattern?.name || 'Pattern'}`,
        direction: signal.pattern?.direction === 'bullish' ? 'bearish' : 'bullish',
        class: signal.pattern?.class || 'single',
        barsInvolved: signal.pattern?.barsInvolved || 1,
        patternHigh: signal.pattern?.patternHigh || 0,
        patternLow: signal.pattern?.patternLow || 0
      },
      plan: {
        ...signal.plan,
        direction: signal.plan.direction === 'long' ? 'short' : 'long',
        // For fade trades, entry is typically at current price (pattern failure point)
        entry: signal.currentPrice || signal.plan.entry,
        // Proper fade trade risk management
        stop: signal.plan.direction === 'long' 
          ? (signal.currentPrice || signal.plan.entry) + ((signal.currentPrice || signal.plan.entry) * 0.02) // 2% above for short
          : (signal.currentPrice || signal.plan.entry) - ((signal.currentPrice || signal.plan.entry) * 0.02), // 2% below for long
        targets: signal.plan.direction === 'long'
          ? [(signal.currentPrice || signal.plan.entry) - ((signal.currentPrice || signal.plan.entry) * 0.05)] // 5% down target for short
          : [(signal.currentPrice || signal.plan.entry) + ((signal.currentPrice || signal.plan.entry) * 0.05)]  // 5% up target for long
      },
      notes: [
        ...(signal.notes || []),
        `🎯 FADE TRADE: Betting against ${signal.pattern?.name || 'pattern'} due to high trap risk`
      ]
    };

    return handlePlaceOrder(fadeSignal);
  };

  const handlePlaceOrder = async (signal: Signal) => {
    if (!signal.plan) {
      alert('This signal does not have a trading plan');
      return;
    }

    // Check MT5 status first
    const currentStatus = await checkMT5Status();
    
    console.log('Current status from API:', currentStatus);
    console.log('currentStatus?.connected:', currentStatus?.connected);
    
    if (!currentStatus?.connected) {
      const confirmStart = window.confirm(
        'MetaApi is not connected. This could mean:\n\n' +
        '1. Your MT5 account is not yet connected in MetaApi\n' +
        '2. The MetaApi credentials in .env are incorrect\n' +
        '3. Your MT5 account needs to be deployed\n\n' +
        'Please check your MetaApi dashboard and ensure your FXPro account is connected.\n\n' +
        'Click OK to retry the connection.'
      );
      
      if (!confirmStart) return;
      
      // Check status again
      const retryStatus = await checkMT5Status();
      if (!retryStatus?.connected) {
        alert('MetaApi is still not connected. Please check your MetaApi dashboard.');
        return;
      }
    }

    // MetaApi handles the MT5 connection, so if MetaApi is connected, we're good to go
    // No need for separate mt5Connected check with MetaApi

    // Preview order to check for price adjustments
    setPlacingOrder(signal.id);
    
    try {
      const previewResponse = await fetch(`${getBaseUrl()}/api/candlestick/mt5/preview-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signal)
      });
      
      const preview = await previewResponse.json();
      
      if (!preview.success) {
        alert(`Failed to preview order: ${preview.error}`);
        setPlacingOrder(null);
        return;
      }
      
      // Check if prices were adjusted
      const hasAdjustments = preview.data.adjustmentReason || 
        preview.data.original.entry !== preview.data.adjusted.entry ||
        preview.data.original.stop !== preview.data.adjusted.stop ||
        preview.data.original.takeProfit !== preview.data.adjusted.takeProfit;
      
      let confirmMessage = `Place ${signal.plan.direction.toUpperCase()} order for ${signal.symbol}?\n\n` +
        `Pattern: ${signal.pattern?.name || 'Unknown'}\n` +
        `Score: ${signal.score || 'N/A'}\n` +
        `Current Market Price: $${preview.data.currentMarketPrice || 'N/A'}\n\n`;
      
      if (hasAdjustments) {
        confirmMessage += `⚠️ PRICE ADJUSTMENTS REQUIRED ⚠️\n\n`;
        if (preview.data.adjustmentReason) {
          confirmMessage += `Reason: ${preview.data.adjustmentReason}\n\n`;
        }
        confirmMessage += `ORIGINAL PRICES:\n` +
          `Entry: $${preview.data.original.entry.toFixed(2)}\n` +
          `Stop Loss: $${preview.data.original.stop.toFixed(2)}\n` +
          `Take Profit: $${preview.data.original.takeProfit.toFixed(2)}\n\n` +
          `ADJUSTED PRICES:\n` +
          `Entry: $${preview.data.adjusted.entry.toFixed(2)} (${preview.data.original.entry !== preview.data.adjusted.entry ? '⚠️ Changed' : '✓'})\n` +
          `Stop Loss: $${preview.data.adjusted.stop.toFixed(2)} (${preview.data.original.stop !== preview.data.adjusted.stop ? '⚠️ Changed' : '✓'})\n` +
          `Take Profit: $${preview.data.adjusted.takeProfit.toFixed(2)} (${preview.data.original.takeProfit !== preview.data.adjusted.takeProfit ? '⚠️ Changed' : '✓'})\n` +
          `Order Type: ${preview.data.adjusted.orderType}\n\n` +
          `Do you want to proceed with the ADJUSTED prices?`;
      } else {
        confirmMessage += `Entry: $${preview.data.original.entry.toFixed(2)}\n` +
          `Stop Loss: $${preview.data.original.stop.toFixed(2)}\n` +
          `Take Profit: $${preview.data.original.takeProfit.toFixed(2)}\n` +
          `Order Type: ${preview.data.adjusted.orderType}\n` +
          `Volume: ${signal.plan.positionQty}\n` +
          `Risk/Reward: ${signal.plan.riskRewardRatio}`;
      }
      
      const confirmOrder = window.confirm(confirmMessage);
      
      if (!confirmOrder) {
        setPlacingOrder(null);
        return;
      }
    } catch (error) {
      console.error('Error previewing order:', error);
      setPlacingOrder(null);
      alert('Failed to preview order. Please try again.');
      return;
    }

    try {
      const response = await fetch(`${getBaseUrl()}/api/candlestick/mt5/place-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signal)
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(
          `✅ Order placed successfully!\n\n` +
          `Symbol: ${result.symbol || signal.symbol}\n` +
          `Order ID: ${result.orderId || result.ticket || 'N/A'}\n` +
          `Volume: ${result.volume || signal.plan.positionQty}\n` +
          `Price: $${result.price || signal.plan.entry}`
        );
      } else {
        alert(`❌ Failed to place order:\n\n${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error placing order:', error);
      alert('Failed to communicate with MT5 bridge. Please check the connection.');
    } finally {
      setPlacingOrder(null);
    }
  };

  // CAN SLIM Scan function
  const runCanslimScan = async () => {
    setCanslimLoading(true);
    setCanslimResult(null);
    try {
      const response = await fetch(`${getBaseUrl()}/api/canslim/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: canslimDryRun,
          force: canslimForce,
          margin: 25,
          maxTrades: 10,
          minScore: 4
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setCanslimResult(data);
    } catch (error) {
      console.error('Error running CAN SLIM scan:', error);
      alert('Error running CAN SLIM scan. Please try again.');
    } finally {
      setCanslimLoading(false);
    }
  };

  // Fetch logs
  const fetchBackendLogs = async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/canslim/logs/backend`);
      if (response.ok) {
        const data = await response.json();
        setBackendLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Error fetching backend logs:', error);
    }
  };

  const fetchScanLogs = async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/canslim/logs/scan`);
      if (response.ok) {
        const data = await response.json();
        setScanLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Error fetching scan logs:', error);
    }
  };

  const clearBackendLogs = async () => {
    try {
      await fetch(`${getBaseUrl()}/api/canslim/logs/backend/clear`, { method: 'POST' });
      setBackendLogs([]);
    } catch (error) {
      console.error('Error clearing backend logs:', error);
    }
  };

  const clearScanLogs = async () => {
    try {
      await fetch(`${getBaseUrl()}/api/canslim/logs/scan/clear`, { method: 'POST' });
      setScanLogs([]);
    } catch (error) {
      console.error('Error clearing scan logs:', error);
    }
  };

  const fetchServerLogs = async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/canslim/logs/server`);
      if (response.ok) {
        const data = await response.json();
        setServerLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Error fetching server logs:', error);
    }
  };

  const clearServerLogs = async () => {
    try {
      await fetch(`${getBaseUrl()}/api/canslim/logs/server/clear`, { method: 'POST' });
      setServerLogs([]);
    } catch (error) {
      console.error('Error clearing server logs:', error);
    }
  };

  // Auto-fetch logs when log panel is open
  useEffect(() => {
    if (showLogs) {
      fetchBackendLogs();
      fetchScanLogs();
      fetchServerLogs();
      const interval = setInterval(() => {
        fetchBackendLogs();
        fetchScanLogs();
        fetchServerLogs();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [showLogs]);

  // Track if user has manually scrolled up (using refs to avoid re-render issues)
  const userScrolledBackend = useRef(false);
  const userScrolledScan = useRef(false);
  const userScrolledServer = useRef(false);

  // Check if scrolled to bottom (with small tolerance)
  const isScrolledToBottom = (el: HTMLElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  // Scroll handlers - detect manual scroll
  const handleBackendScroll = () => {
    if (backendLogRef.current) {
      userScrolledBackend.current = !isScrolledToBottom(backendLogRef.current);
    }
  };

  const handleScanScroll = () => {
    if (scanLogRef.current) {
      userScrolledScan.current = !isScrolledToBottom(scanLogRef.current);
    }
  };

  const handleServerScroll = () => {
    if (serverLogRef.current) {
      userScrolledServer.current = !isScrolledToBottom(serverLogRef.current);
    }
  };

  // Auto-scroll logs only if user hasn't manually scrolled up
  useEffect(() => {
    if (autoScrollLogs) {
      if (backendLogRef.current && !userScrolledBackend.current) {
        backendLogRef.current.scrollTop = backendLogRef.current.scrollHeight;
      }
      if (scanLogRef.current && !userScrolledScan.current) {
        scanLogRef.current.scrollTop = scanLogRef.current.scrollHeight;
      }
      if (serverLogRef.current && !userScrolledServer.current) {
        serverLogRef.current.scrollTop = serverLogRef.current.scrollHeight;
      }
    }
  }, [backendLogs, scanLogs, serverLogs, autoScrollLogs]);

  return (
    <div className="stock-scan-page">
      <div className="page-header">
        <h1 className="page-title">Real-Time Pattern Scanner (5m)</h1>
        <div className="scanner-status">
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
            WebSocket: {connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className={`status-indicator ${polygonConnected ? 'connected' : 'disconnected'}`}>
            Polygon: {polygonConnected ? 'Connected' : 'Disconnected'}
          </span>
          <span className={`scanning-indicator ${scanning ? 'active' : ''}`}>
            {scanning ? `Scanning ${watchlist.length} stocks (5m candles)` : 'Not scanning'}
          </span>
          
          {/* Compact Sound Controls */}
          <div className="sound-controls-compact">
            <span className="sound-icon" onClick={() => setSoundEnabled(!soundEnabled)}>
              {soundEnabled ? '🔊' : '🔇'}
            </span>
            {soundEnabled && (
              <>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  className="volume-slider-compact"
                  title={`Volume: ${Math.round(soundVolume * 100)}%`}
                />
                <span className="volume-label">{Math.round(soundVolume * 100)}%</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="scanner-controls">
        <div className="watchlist-section">
          <div className="controls-row">
            <button
              onClick={() => setShowWatchlist(true)}
              style={{
                background: '#6c757d',
                color: 'white',
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Watchlist ({watchlist.length})
            </button>
            <div className="connection-controls">
              <button
                className={`control-button-compact ${polygonConnected ? 'stop' : 'start'}`}
                onClick={polygonConnected ? disconnectFromPolygon : connectToPolygon}
              >
                {polygonConnected ? 'Disconnect' : 'Connect'}
              </button>
              <button
                className={`control-button-compact ${realDataEnabled ? 'stop' : 'start'}`}
                onClick={realDataEnabled ? stopRealData : startRealData}
                disabled={!connected || !polygonConnected}
              >
                {realDataEnabled ? 'Stop Data' : 'Get Data'}
              </button>
            </div>
          </div>
          {realDataEnabled && (
            <div className="data-status">
              Receiving live data
            </div>
          )}
          {!connected && (
            <div className="connection-warning">
              Waiting for WebSocket connection...
            </div>
          )}
          {connected && !polygonConnected && (
            <div className="connection-warning">
              Please connect to Polygon to start receiving real-time data
            </div>
          )}
        </div>

        {/* Watchlist Popup */}
        {showWatchlist && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }} onClick={() => setShowWatchlist(false)}>
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '8px',
              maxWidth: '90%',
              maxHeight: '80%',
              overflow: 'auto',
              position: 'relative'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>Watchlist ({watchlist.length} stocks)</h3>
                <button
                  onClick={() => setShowWatchlist(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    padding: '0 5px'
                  }}
                >
                  ×
                </button>
              </div>
              <form onSubmit={handleAddSymbol} style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
                <input
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  placeholder="Add symbol..."
                  className="symbol-input"
                  style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
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
          </div>
        )}

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
                if (!e.target.checked) {
                  if (mockRunning) stopMockData();
                  if (mockSignalsRunning) stopMockSignals();
                }
              }}
            />
            Test Mode
          </label>
          {testMode && (
            <div className="test-controls">
              <p className="test-info">
                Use mock data or mock signals to test the application. Mock data generates candles that go through pattern detection, while mock signals create pre-scored patterns directly.
              </p>
              <div className="test-buttons">
                <div className="test-button-group">
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
                <div className="test-button-group">
                  <button
                    className={`test-button ${mockSignalsRunning ? 'stop' : 'start'}`}
                    onClick={mockSignalsRunning ? stopMockSignals : startMockSignals}
                  >
                    {mockSignalsRunning ? 'Stop Mock Signals' : 'Start Mock Signals'}
                  </button>
                  {mockSignalsRunning && (
                    <span className="mock-status">
                      Mock signals running - high-scoring patterns appear immediately
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CAN SLIM Trading Section */}
        <div className="canslim-section" style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
          <h3 style={{ margin: '0 0 15px 0', borderBottom: '2px solid #28a745', paddingBottom: '8px' }}>CAN SLIM Trading</h3>

          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={canslimDryRun}
                onChange={(e) => setCanslimDryRun(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span>Dry Run</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={canslimForce}
                onChange={(e) => setCanslimForce(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span>Force (ignore market hours)</span>
            </label>

            <button
              onClick={runCanslimScan}
              disabled={canslimLoading}
              style={{
                background: canslimDryRun ? '#007bff' : '#28a745',
                color: 'white',
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                cursor: canslimLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {canslimLoading ? 'Scanning...' : canslimDryRun ? 'Run Test Scan' : 'Run LIVE Scan'}
            </button>

            {!canslimDryRun && (
              <span style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '14px' }}>
                LIVE MODE - Real trades!
              </span>
            )}
          </div>

          {canslimResult && (
            <div style={{ marginTop: '15px' }}>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <span style={{ color: canslimResult.marketOpen ? '#28a745' : '#dc3545' }}>
                  <strong>Market:</strong> {canslimResult.marketOpen ? 'OPEN' : 'CLOSED'}
                  {canslimResult.currentTimeET && ` (${canslimResult.currentTimeET})`}
                </span>
                <span><strong>Scanned:</strong> {canslimResult.result?.scanned || 0}</span>
                <span style={{ color: '#28a745' }}><strong>Executed:</strong> {canslimResult.result?.executed || 0}</span>
                <span><strong>Positions:</strong> {canslimResult.broker?.positions || 0}</span>
                <span><strong>Orders:</strong> {canslimResult.broker?.orders || 0}</span>
              </div>
              {canslimResult.result?.skipped && (
                <div style={{ color: '#856404', fontSize: '13px' }}>
                  Skipped: {canslimResult.result.skipped}
                </div>
              )}
            </div>
          )}

          {/* Log Viewer Toggle */}
          <button
            onClick={() => setShowLogs(!showLogs)}
            style={{
              marginTop: '15px',
              background: showLogs ? '#6c757d' : '#17a2b8',
              color: 'white',
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {showLogs ? 'Hide Logs' : 'Show Logs'}
          </button>
        </div>
      </div>

      {/* Log Viewers - Full Width */}
      {showLogs && (
        <div style={{ margin: '20px 0', padding: '0 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* CAN SLIM Logs */}
            <div style={{
              background: '#1e1e1e',
              borderRadius: '8px',
              border: '1px solid #333',
              overflow: 'hidden'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 15px',
                background: '#2d2d2d',
                borderBottom: '1px solid #333'
              }}>
                <span style={{ color: '#61afef', fontWeight: 'bold' }}>CAN SLIM API ({backendLogs.length})</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={fetchBackendLogs} style={{ background: '#007bff', color: 'white', padding: '3px 8px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Refresh</button>
                  <button onClick={clearBackendLogs} style={{ background: '#dc3545', color: 'white', padding: '3px 8px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Clear</button>
                </div>
              </div>
              <div
                ref={backendLogRef}
                data-log-content
                onScroll={handleBackendScroll}
                style={{
                  height: `${backendLogHeight}px`,
                  overflow: 'auto',
                  padding: '10px 15px',
                  fontFamily: 'Monaco, Consolas, monospace',
                  fontSize: '11px',
                  lineHeight: '1.4'
                }}
              >
                {backendLogs.length === 0 ? (
                  <div style={{ color: '#666' }}>No CAN SLIM API logs yet.</div>
                ) : (
                  backendLogs.map((log, idx) => (
                    <div key={idx} style={{ color: log.level === 'error' ? '#ff6b6b' : log.level === 'warn' ? '#ffd93d' : '#61afef', marginBottom: '2px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      <span style={{ color: '#666' }}>{new Date(log.timestamp).toLocaleTimeString()}</span> {log.message}
                    </div>
                  ))
                )}
              </div>
              <div
                onMouseDown={createResizeHandler(setBackendLogHeight)}
                style={{
                  height: '6px',
                  background: '#333',
                  cursor: 'ns-resize',
                  borderTop: '1px solid #444',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.background = '#007bff'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.background = '#333'}
              />
            </div>

            {/* Scan Logs */}
            <div style={{
              background: '#1e1e1e',
              borderRadius: '8px',
              border: '1px solid #333',
              overflow: 'hidden'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 15px',
                background: '#2d2d2d',
                borderBottom: '1px solid #333'
              }}>
                <span style={{ color: '#98c379', fontWeight: 'bold' }}>CAN SLIM Scanner ({scanLogs.length})</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={fetchScanLogs} style={{ background: '#007bff', color: 'white', padding: '3px 8px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Refresh</button>
                  <button onClick={clearScanLogs} style={{ background: '#dc3545', color: 'white', padding: '3px 8px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Clear</button>
                </div>
              </div>
              <div
                ref={scanLogRef}
                data-log-content
                onScroll={handleScanScroll}
                style={{
                  height: `${scanLogHeight}px`,
                  overflow: 'auto',
                  padding: '10px 15px',
                  fontFamily: 'Monaco, Consolas, monospace',
                  fontSize: '11px',
                  lineHeight: '1.4'
                }}
              >
                {scanLogs.length === 0 ? (
                  <div style={{ color: '#666' }}>No scan logs yet. Run a scan to see output here.</div>
                ) : (
                  scanLogs.map((log, idx) => (
                    <div key={idx} style={{ color: log.level === 'error' ? '#ff6b6b' : log.level === 'warn' ? '#ffd93d' : '#98c379', marginBottom: '2px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      <span style={{ color: '#666' }}>{new Date(log.timestamp).toLocaleTimeString()}</span> {log.message}
                    </div>
                  ))
                )}
              </div>
              <div
                onMouseDown={createResizeHandler(setScanLogHeight)}
                style={{
                  height: '6px',
                  background: '#333',
                  cursor: 'ns-resize',
                  borderTop: '1px solid #444',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.background = '#28a745'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.background = '#333'}
              />
            </div>
          </div>

          {/* Server Logs - Full Width */}
          <div style={{
            background: '#1e1e1e',
            borderRadius: '8px',
            border: '1px solid #333',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 15px',
              background: '#2d2d2d',
              borderBottom: '1px solid #333'
            }}>
              <span style={{ color: '#e5c07b', fontWeight: 'bold' }}>Server / Polygon / Aggregator ({serverLogs.length})</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={fetchServerLogs} style={{ background: '#007bff', color: 'white', padding: '3px 8px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Refresh</button>
                <button onClick={clearServerLogs} style={{ background: '#dc3545', color: 'white', padding: '3px 8px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Clear</button>
              </div>
            </div>
            <div
              ref={serverLogRef}
              data-log-content
              onScroll={handleServerScroll}
              style={{
                height: `${serverLogHeight}px`,
                overflow: 'auto',
                padding: '10px 15px',
                fontFamily: 'Monaco, Consolas, monospace',
                fontSize: '11px',
                lineHeight: '1.4'
              }}
            >
              {serverLogs.length === 0 ? (
                <div style={{ color: '#666' }}>No server logs yet. Connect to Polygon to see activity.</div>
              ) : (
                serverLogs.map((log, idx) => (
                  <div key={idx} style={{ color: log.level === 'error' ? '#ff6b6b' : log.level === 'warn' ? '#ffd93d' : '#e5c07b', marginBottom: '2px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    <span style={{ color: '#666' }}>{new Date(log.timestamp).toLocaleTimeString()}</span> {log.message}
                  </div>
                ))
              )}
            </div>
            <div
              onMouseDown={createResizeHandler(setServerLogHeight)}
              style={{
                height: '6px',
                background: '#333',
                cursor: 'ns-resize',
                borderTop: '1px solid #444',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => (e.target as HTMLElement).style.background = '#ffc107'}
              onMouseLeave={(e) => (e.target as HTMLElement).style.background = '#333'}
            />
          </div>

          {/* Auto-scroll toggle */}
          <div style={{ marginTop: '10px' }}>
            <label style={{ color: '#666', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input type="checkbox" checked={autoScrollLogs} onChange={(e) => setAutoScrollLogs(e.target.checked)} />
              Auto-scroll logs
            </label>
          </div>
        </div>
      )}

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
                    <div className="signal-header-right">
                      <div className="time-and-risk">
                        <span className="signal-time">{formatSignalTime(timestamp)}</span>
                        {/* Compact Trap Risk Warning */}
                        {signal.trapRisk && signal.trapRisk !== 'none' && (
                          <span className={`trap-risk-compact trap-${signal.trapRisk}`}>
                            {signal.trapRisk === 'high' && 'HIGH TRAP RISK'}
                            {signal.trapRisk === 'medium' && 'MED TRAP RISK'}
                            {signal.trapRisk === 'low' && 'LOW TRAP RISK'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="signal-card-content">
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
                    <div className="trade-plan mt5-format">
                      <div className="plan-header">
                        <span className="plan-title">MT5 Order Setup</span>
                      </div>
                      <div className="plan-details">
                        <div className="plan-row">
                          <span className="plan-label">Type:</span>
                          <span className="plan-value">Pending Order</span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">Order Type:</span>
                          <span className="plan-value order-type">
                            {signal.currentPrice ? 
                              getMT5OrderType(signal.plan.direction, signal.currentPrice, signal.plan.entry) : 
                              `${signal.plan.direction === 'long' ? 'Buy' : 'Sell'} Stop/Limit`
                            }
                          </span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">Price:</span>
                          <span className="plan-value">${signal.plan.entry.toFixed(2)}</span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">Stop Loss:</span>
                          <span className="plan-value">${signal.plan.stop.toFixed(2)}</span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">Take Profit:</span>
                          <span className="plan-value">${signal.plan.targets[0].toFixed(2)}</span>
                        </div>
                        {signal.currentPrice && (
                          <div className="plan-row current-price">
                            <span className="plan-label">Current Price:</span>
                            <span className="plan-value">${signal.currentPrice.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="plan-row">
                          <span className="plan-label">Volume:</span>
                          <span className="plan-value">{signal.plan.positionQty}</span>
                        </div>
                        <div className="plan-row">
                          <span className="plan-label">Risk/Reward:</span>
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
                  </div>

                  <div className="signal-actions">
                    <button 
                      className="view-chart-button"
                      onClick={() => window.open(`/charts?symbol=${signal.symbol}`, '_blank')}
                    >
                      View Chart
                    </button>
                    <button 
                      className="place-order-button"
                      onClick={() => handlePlaceOrder(signal)}
                      disabled={!signal.plan || placingOrder === signal.id}
                    >
                      {placingOrder === signal.id ? 'Placing Order...' : 'Place MT5 Order'}
                    </button>
                    {/* Fade Pattern button - only show for high trap risk */}
                    {signal.trapRisk === 'high' && (
                      <button 
                        className="fade-pattern-button"
                        onClick={() => handleFadePattern(signal)}
                        disabled={!signal.plan || placingOrder === signal.id + '-fade'}
                        style={{
                          backgroundColor: '#FF6B6B',
                          color: 'white',
                          border: '1px solid #E74C3C',
                          fontSize: '0.9rem',
                          fontWeight: 'bold'
                        }}
                      >
                        {placingOrder === signal.id + '-fade' ? 'Placing Fade...' : '🎯 Fade Pattern'}
                      </button>
                    )}
                  </div>
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