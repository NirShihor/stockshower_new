import logging
from typing import Dict, Any, List
from datetime import datetime, timedelta
from mt5_client import MT5Client
from signal_fetcher import SignalFetcher
from config import ScannerConfig, SafetyConfig

class TradeManager:
    def __init__(self):
        self.mt5 = MT5Client()
        self.fetcher = SignalFetcher()
        self.logger = logging.getLogger(__name__)
        self.processed_signals = set()  # Track processed signal IDs
        self.daily_trade_count = 0
        self.last_reset_date = datetime.now().date()
        
    def reset_daily_counters(self):
        """Reset daily trade counters if new day"""
        current_date = datetime.now().date()
        if current_date > self.last_reset_date:
            self.daily_trade_count = 0
            self.last_reset_date = current_date
            self.logger.info("Daily trade counter reset")
    
    def can_trade_today(self) -> bool:
        """Check if we can still trade today"""
        self.reset_daily_counters()
        return self.daily_trade_count < ScannerConfig.MAX_TRADES_PER_DAY
    
    def calculate_position_size(self, signal: Dict[str, Any]) -> float:
        """Calculate position size based on risk management"""
        account_info = self.mt5.get_account_info()
        if not account_info:
            return 0.01  # Minimum lot size fallback
        
        balance = account_info['balance']
        risk_amount = balance * (ScannerConfig.RISK_PERCENTAGE / 100)
        
        entry_price = signal['plan']['entry']
        stop_price = signal['plan']['stop']
        risk_per_share = abs(entry_price - stop_price)
        
        if risk_per_share <= 0:
            return 0.01
        
        # For stocks: shares / 100 = lots (assuming 100 shares per lot)
        shares = risk_amount / risk_per_share
        lots = max(0.01, round(shares / 100, 2))  # Round to 2 decimal places
        
        # Cap at maximum reasonable position size
        max_lots = min(10.0, balance / 1000)  # Max 1 lot per $1000 balance
        return min(lots, max_lots)
    
    def validate_signal(self, signal: Dict[str, Any]) -> tuple[bool, str]:
        """Validate if signal is suitable for trading"""
        # Check if already processed
        signal_id = signal.get('id')
        if signal_id in self.processed_signals:
            return False, "Signal already processed"
        
        # Check signal age (avoid stale signals)
        signal_time = datetime.fromisoformat(signal.get('time', '').replace('Z', '+00:00'))
        age_minutes = (datetime.now(signal_time.tzinfo) - signal_time).total_seconds() / 60
        
        if age_minutes > 30:  # Reject signals older than 30 minutes
            return False, f"Signal too old: {age_minutes:.1f} minutes"
        
        # Check if symbol is available in MT5
        symbol_info = self.mt5.get_symbol_info(signal['symbol'])
        if not symbol_info:
            return False, f"Symbol {signal['symbol']} not available in MT5"
        
        # Check if market is open (basic check)
        if symbol_info['trade_mode'] == 0:  # Trade disabled
            return False, "Trading disabled for symbol"
        
        # Validate plan completeness
        plan = signal.get('plan', {})
        required_fields = ['direction', 'entry', 'stop', 'targets']
        for field in required_fields:
            if not plan.get(field):
                return False, f"Missing plan field: {field}"
        
        return True, "Signal validated"
    
    def process_signal(self, signal: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single signal"""
        # Validate signal
        valid, message = self.validate_signal(signal)
        if not valid:
            return {'success': False, 'error': message}
        
        # Check daily trade limit
        if not self.can_trade_today():
            return {'success': False, 'error': 'Daily trade limit reached'}
        
        # Calculate position size
        volume = self.calculate_position_size(signal)
        if volume <= 0:
            return {'success': False, 'error': 'Invalid position size calculated'}
        
        # Place order
        result = self.mt5.place_order(signal, volume, SafetyConfig.DRY_RUN_MODE)
        
        if result['success']:
            # Mark signal as processed
            self.processed_signals.add(signal.get('id'))
            
            if not SafetyConfig.DRY_RUN_MODE:
                self.daily_trade_count += 1
            
            self.logger.info(f"Signal processed: {signal['symbol']} {signal['pattern']['name']} (Score: {signal['score']})")
        
        return result
    
    def process_pending_signals(self) -> List[Dict[str, Any]]:
        """Fetch and process all pending signals"""
        results = []
        
        if not self.can_trade_today():
            self.logger.info("Daily trade limit reached, skipping signal processing")
            return results
        
        # Fetch signals
        signals = self.fetcher.get_pending_signals()
        actionable_signals = self.fetcher.filter_actionable_signals(signals)
        
        if not actionable_signals:
            self.logger.info("No actionable signals found")
            return results
        
        # Sort by score (highest first)
        actionable_signals.sort(key=lambda x: x.get('score', 0), reverse=True)
        
        # Process each signal
        for signal in actionable_signals:
            if not self.can_trade_today():
                break
                
            result = self.process_signal(signal)
            result['signal_id'] = signal.get('id')
            result['symbol'] = signal.get('symbol')
            result['pattern'] = signal.get('pattern', {}).get('name', 'Unknown')
            result['score'] = signal.get('score', 0)
            
            results.append(result)
            
            # Brief pause between orders
            import time
            time.sleep(1)
        
        return results
    
    def get_status(self) -> Dict[str, Any]:
        """Get current trade manager status"""
        account_info = self.mt5.get_account_info() if self.mt5.connected else None
        
        return {
            'mt5_connected': self.mt5.connected,
            'scanner_connected': self.fetcher.test_connection(),
            'account_info': account_info,
            'daily_trades': self.daily_trade_count,
            'max_daily_trades': ScannerConfig.MAX_TRADES_PER_DAY,
            'processed_signals_count': len(self.processed_signals),
            'dry_run_mode': SafetyConfig.DRY_RUN_MODE,
            'auto_trade_enabled': SafetyConfig.AUTO_TRADE_ENABLED,
            'open_positions': len(self.mt5.get_open_positions()),
            'pending_orders': len(self.mt5.get_pending_orders())
        }