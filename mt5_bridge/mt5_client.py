import MetaTrader5 as mt5
import logging
from typing import Optional, Dict, Any
from config import MT5Config, get_mt5_symbol

class MT5Client:
    def __init__(self):
        self.connected = False
        self.logger = logging.getLogger(__name__)
        
    def connect(self) -> bool:
        """Connect to MetaTrader 5"""
        try:
            # Initialize MT5
            if not mt5.initialize():
                self.logger.error("Failed to initialize MT5")
                return False
            
            # Login to account
            if not mt5.login(
                login=MT5Config.LOGIN,
                password=MT5Config.PASSWORD,
                server=MT5Config.SERVER
            ):
                self.logger.error(f"Failed to login to MT5: {mt5.last_error()}")
                mt5.shutdown()
                return False
            
            account_info = mt5.account_info()
            if account_info is None:
                self.logger.error("Failed to get account info")
                return False
            
            self.logger.info(f"Connected to MT5 account: {account_info.login}")
            self.logger.info(f"Account balance: {account_info.balance}")
            self.logger.info(f"Account equity: {account_info.equity}")
            
            self.connected = True
            return True
            
        except Exception as e:
            self.logger.error(f"Error connecting to MT5: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from MetaTrader 5"""
        if self.connected:
            mt5.shutdown()
            self.connected = False
            self.logger.info("Disconnected from MT5")
    
    def get_account_info(self) -> Optional[Dict[str, Any]]:
        """Get account information"""
        if not self.connected:
            return None
            
        account_info = mt5.account_info()
        if account_info is None:
            return None
            
        return {
            'login': account_info.login,
            'balance': account_info.balance,
            'equity': account_info.equity,
            'margin': account_info.margin,
            'free_margin': account_info.margin_free,
            'margin_level': account_info.margin_level,
            'currency': account_info.currency
        }
    
    def get_symbol_info(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get symbol information"""
        if not self.connected:
            return None
        
        mt5_symbol = get_mt5_symbol(symbol)
        symbol_info = mt5.symbol_info(mt5_symbol)
        
        if symbol_info is None:
            self.logger.warning(f"Symbol {mt5_symbol} not found")
            return None
        
        return {
            'symbol': symbol_info.name,
            'bid': symbol_info.bid,
            'ask': symbol_info.ask,
            'spread': symbol_info.spread,
            'digits': symbol_info.digits,
            'point': symbol_info.point,
            'volume_min': symbol_info.volume_min,
            'volume_max': symbol_info.volume_max,
            'volume_step': symbol_info.volume_step,
            'trade_mode': symbol_info.trade_mode
        }
    
    def place_order(self, signal: Dict[str, Any], volume: float, dry_run: bool = True) -> Dict[str, Any]:
        """Place an order based on signal"""
        if not self.connected:
            return {'success': False, 'error': 'Not connected to MT5'}
        
        symbol = signal['symbol']
        mt5_symbol = get_mt5_symbol(symbol)
        direction = signal['plan']['direction']
        entry_price = signal['plan']['entry']
        stop_loss = signal['plan']['stop']
        take_profit = signal['plan']['targets'][0] if signal['plan']['targets'] else None
        
        # Determine order type
        if direction == 'long':
            order_type = mt5.ORDER_TYPE_BUY_LIMIT
        else:
            order_type = mt5.ORDER_TYPE_SELL_LIMIT
        
        # Prepare request
        request = {
            "action": mt5.TRADE_ACTION_PENDING,
            "symbol": mt5_symbol,
            "volume": volume,
            "type": order_type,
            "price": entry_price,
            "sl": stop_loss,
            "comment": f"Scanner: {signal['pattern']['name']} (Score: {signal['score']})",
            "type_time": mt5.ORDER_TIME_DAY,  # Valid for the day
            "type_filling": mt5.ORDER_FILLING_FOK,
        }
        
        if take_profit:
            request["tp"] = take_profit
        
        if dry_run:
            self.logger.info(f"DRY RUN - Would place order: {request}")
            return {
                'success': True,
                'dry_run': True,
                'order_details': request,
                'message': f"DRY RUN: {direction.upper()} order for {mt5_symbol}"
            }
        
        # Send order
        result = mt5.order_send(request)
        
        if result is None:
            error = mt5.last_error()
            self.logger.error(f"Order failed: {error}")
            return {'success': False, 'error': str(error)}
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            self.logger.error(f"Order failed with retcode: {result.retcode}")
            return {
                'success': False, 
                'error': f"Order failed: {result.retcode}",
                'retcode': result.retcode
            }
        
        self.logger.info(f"Order placed successfully: {result.order}")
        return {
            'success': True,
            'order_ticket': result.order,
            'volume': result.volume,
            'price': result.price,
            'symbol': mt5_symbol
        }
    
    def get_open_positions(self) -> list:
        """Get all open positions"""
        if not self.connected:
            return []
        
        positions = mt5.positions_get()
        if positions is None:
            return []
        
        return [
            {
                'ticket': pos.ticket,
                'symbol': pos.symbol,
                'type': pos.type,
                'volume': pos.volume,
                'price_open': pos.price_open,
                'price_current': pos.price_current,
                'profit': pos.profit,
                'comment': pos.comment
            }
            for pos in positions
        ]
    
    def get_pending_orders(self) -> list:
        """Get all pending orders"""
        if not self.connected:
            return []
        
        orders = mt5.orders_get()
        if orders is None:
            return []
        
        return [
            {
                'ticket': order.ticket,
                'symbol': order.symbol,
                'type': order.type,
                'volume': order.volume_initial,
                'price_open': order.price_open,
                'sl': order.sl,
                'tp': order.tp,
                'comment': order.comment
            }
            for order in orders
        ]