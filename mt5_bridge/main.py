#!/usr/bin/env python3
"""
MT5 Bridge - Automatic Trading Bridge for Pattern Scanner
"""

import logging
import time
import signal
import sys
from datetime import datetime
from trade_manager import TradeManager
from config import validate_config, SafetyConfig

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mt5_bridge.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

class MT5Bridge:
    def __init__(self):
        self.running = False
        self.trade_manager = None
        
    def start(self):
        """Start the MT5 bridge"""
        logger.info("Starting MT5 Bridge...")
        
        try:
            # Validate configuration
            validate_config()
            
            # Initialize trade manager
            self.trade_manager = TradeManager()
            
            # Connect to MT5
            if not self.trade_manager.mt5.connect():
                logger.error("Failed to connect to MT5")
                return False
            
            # Test scanner connection
            if not self.trade_manager.fetcher.test_connection():
                logger.error("Failed to connect to scanner")
                return False
            
            logger.info("All connections established successfully")
            
            # Print status
            status = self.trade_manager.get_status()
            logger.info(f"Status: {status}")
            
            if SafetyConfig.DRY_RUN_MODE:
                logger.warning("🔶 DRY RUN MODE - No real trades will be placed!")
            
            if not SafetyConfig.AUTO_TRADE_ENABLED:
                logger.warning("🛑 AUTO TRADE DISABLED - Manual mode only")
                return self.manual_mode()
            
            # Start automatic mode
            return self.automatic_mode()
            
        except Exception as e:
            logger.error(f"Failed to start bridge: {e}")
            return False
    
    def automatic_mode(self):
        """Run in automatic trading mode"""
        logger.info("🤖 Starting automatic trading mode...")
        self.running = True
        
        while self.running:
            try:
                # Process pending signals
                results = self.trade_manager.process_pending_signals()
                
                if results:
                    logger.info(f"Processed {len(results)} signals:")
                    for result in results:
                        status = "✅ SUCCESS" if result['success'] else "❌ FAILED"
                        logger.info(f"  {status} - {result['symbol']} {result['pattern']} (Score: {result['score']})")
                        if not result['success']:
                            logger.error(f"    Error: {result.get('error', 'Unknown error')}")
                
                # Wait before next check (adjust frequency as needed)
                time.sleep(30)  # Check every 30 seconds
                
            except KeyboardInterrupt:
                logger.info("Received interrupt signal")
                break
            except Exception as e:
                logger.error(f"Error in automatic mode: {e}")
                time.sleep(60)  # Wait longer after error
        
        return True
    
    def manual_mode(self):
        """Run in manual mode with interactive commands"""
        logger.info("📋 Manual mode - Available commands:")
        logger.info("  'status' - Show current status")
        logger.info("  'signals' - Fetch and display pending signals")
        logger.info("  'process' - Process pending signals")
        logger.info("  'positions' - Show open positions")
        logger.info("  'orders' - Show pending orders")
        logger.info("  'quit' - Exit the program")
        
        while True:
            try:
                command = input("\nEnter command: ").strip().lower()
                
                if command == 'quit':
                    break
                elif command == 'status':
                    status = self.trade_manager.get_status()
                    for key, value in status.items():
                        print(f"  {key}: {value}")
                
                elif command == 'signals':
                    signals = self.trade_manager.fetcher.get_pending_signals()
                    actionable = self.trade_manager.fetcher.filter_actionable_signals(signals)
                    print(f"\nFound {len(signals)} total signals, {len(actionable)} actionable:")
                    for signal in actionable[:5]:  # Show top 5
                        print(f"  {signal['symbol']} {signal['pattern']['name']} (Score: {signal['score']})")
                
                elif command == 'process':
                    print("Processing signals...")
                    results = self.trade_manager.process_pending_signals()
                    print(f"Processed {len(results)} signals")
                    for result in results:
                        status = "SUCCESS" if result['success'] else "FAILED"
                        print(f"  {status}: {result['symbol']} {result['pattern']}")
                
                elif command == 'positions':
                    positions = self.trade_manager.mt5.get_open_positions()
                    print(f"\nOpen positions ({len(positions)}):")
                    for pos in positions:
                        print(f"  {pos['symbol']} {pos['type']} {pos['volume']} lots - P&L: {pos['profit']}")
                
                elif command == 'orders':
                    orders = self.trade_manager.mt5.get_pending_orders()
                    print(f"\nPending orders ({len(orders)}):")
                    for order in orders:
                        print(f"  {order['symbol']} {order['type']} {order['volume']} lots @ {order['price_open']}")
                
                else:
                    print("Unknown command. Type 'quit' to exit.")
                    
            except KeyboardInterrupt:
                break
            except Exception as e:
                logger.error(f"Error in manual mode: {e}")
        
        return True
    
    def stop(self):
        """Stop the bridge"""
        logger.info("Stopping MT5 Bridge...")
        self.running = False
        
        if self.trade_manager and self.trade_manager.mt5:
            self.trade_manager.mt5.disconnect()
        
        logger.info("MT5 Bridge stopped")

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}")
    bridge.stop()
    sys.exit(0)

if __name__ == "__main__":
    # Setup signal handlers
    bridge = MT5Bridge()
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        success = bridge.start()
        if not success:
            sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)
    finally:
        bridge.stop()