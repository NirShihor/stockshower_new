// Log capture service - captures console output for frontend display
// This must be imported early in server.ts to capture all logs

export const backendLogs: { timestamp: string; level: string; message: string }[] = [];
export const scanLogs: { timestamp: string; level: string; message: string }[] = [];
export const serverLogs: { timestamp: string; level: string; message: string }[] = [];
const MAX_LOG_ENTRIES = 500;

function addBackendLog(level: string, message: string) {
  const entry = { timestamp: new Date().toISOString(), level, message };
  backendLogs.push(entry);
  if (backendLogs.length > MAX_LOG_ENTRIES) backendLogs.shift();
}

function addScanLog(level: string, message: string) {
  const entry = { timestamp: new Date().toISOString(), level, message };
  scanLogs.push(entry);
  if (scanLogs.length > MAX_LOG_ENTRIES) scanLogs.shift();
}

function addServerLog(level: string, message: string) {
  const entry = { timestamp: new Date().toISOString(), level, message };
  serverLogs.push(entry);
  if (serverLogs.length > MAX_LOG_ENTRIES) serverLogs.shift();
}

// Override console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  
  // CAN SLIM API/Scheduler logs (including Gold fallback and Trailing Stops)
  if (message.includes('[CANSLIM API]') || message.includes('[CANSLIM SCHEDULER]') || message.includes('[SCHEDULER]') || message.includes('[GOLD]') || message.includes('[TRAILING-STOP]')) {
    addBackendLog('info', message);
  }
  
  // CAN SLIM Scanner logs (including Gold fallback, Trailing Stops, and all scan-related output)
  if (message.includes('[CANSLIM]') || message.includes('CAN SLIM') || message.includes('Score:') ||
      message.includes('RS Rating:') || message.includes('Market Regime') || message.includes('SCAN COMPLETE') ||
      message.includes('[GOLD]') || message.includes('[TRAILING-STOP]') || message.includes('[MARKET-CONTEXT]') ||
      message.includes('Summary:') || message.includes('Daily Stats:') || message.includes('Broker Status:') ||
      message.includes('Gold Summary:') || message.includes('Stocks scanned:') || message.includes('Trades executed:') ||
      message.includes('Skipped reason:') || message.includes('Open positions:') || message.includes('Pending orders:') ||
      message.includes('Recommendation:') || message.includes('Traded:') || message.includes('Reason:') ||
      message.includes('EMA') || message.includes('Trend:') || message.includes('VIX') ||
      message.includes('consolidation') || message.includes('breakout') || message.includes('Active positions') ||
      message.includes('Total trades') || message.includes('[MetaApi]') || message.includes('LIVE SCANNER')) {
    addScanLog('info', message);
  }
  
  // Server/Polygon/Aggregator logs - capture more broadly
  if (message.includes('Polygon') || message.includes('AGGREGATOR') || message.includes('Received candle') || 
      message.includes('WebSocket') || message.includes('subscribed') || message.includes('Subscrib') ||
      message.includes('MongoDB') || message.includes('Server running') || message.includes('disconnect') || 
      message.includes('Disconnect') || message.includes('connect') || message.includes('Connect') || 
      message.includes('status') || message.includes('topics') || message.includes('symbols') ||
      message.includes('auth') || message.includes('🔌') || message.includes('🚨') || message.includes('✅') ||
      message.includes('❌') || message.includes('🚫') || message.includes('🧹') || message.includes('🔐') ||
      message.includes('💓') || message.includes('🔴') || message.includes('heartbeat') || message.includes('ping')) {
    addServerLog('info', message);
  }
  
  originalConsoleLog.apply(console, args);
};

console.error = (...args: any[]) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  
  if (message.includes('[CANSLIM API]') || message.includes('[CANSLIM SCHEDULER]') || message.includes('[SCHEDULER]') || message.includes('[GOLD]') || message.includes('[TRAILING-STOP]')) {
    addBackendLog('error', message);
  }
  if (message.includes('[CANSLIM]') || message.includes('CAN SLIM') || message.includes('[GOLD]') ||
      message.includes('[TRAILING-STOP]') || message.includes('[MARKET-CONTEXT]') || message.includes('[MetaApi]')) {
    addScanLog('error', message);
  }
  // Capture all errors in server logs
  addServerLog('error', message);
  
  originalConsoleError.apply(console, args);
};

console.warn = (...args: any[]) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');;
  
  if (message.includes('[CANSLIM API]') || message.includes('[CANSLIM SCHEDULER]') || message.includes('[SCHEDULER]') || message.includes('[GOLD]') || message.includes('[TRAILING-STOP]')) {
    addBackendLog('warn', message);
  }
  if (message.includes('[CANSLIM]') || message.includes('CAN SLIM') || message.includes('[GOLD]') ||
      message.includes('[TRAILING-STOP]') || message.includes('[MARKET-CONTEXT]') || message.includes('[MetaApi]')) {
    addScanLog('warn', message);
  }
  addServerLog('warn', message);
  
  originalConsoleWarn.apply(console, args);
};

export function clearBackendLogs() {
  backendLogs.length = 0;
}

export function clearScanLogs() {
  scanLogs.length = 0;
}

export function clearServerLogs() {
  serverLogs.length = 0;
}

console.log('[LOG CAPTURE] Log capture service initialized');
