import os
from dotenv import load_dotenv

load_dotenv()

class MT5Config:
    LOGIN = int(os.getenv('MT5_LOGIN', '0'))
    PASSWORD = os.getenv('MT5_PASSWORD', '')
    SERVER = os.getenv('MT5_SERVER', '')

class ScannerConfig:
    BASE_URL = os.getenv('SCANNER_BASE_URL', 'http://localhost:5002')
    MIN_SIGNAL_SCORE = float(os.getenv('MINIMUM_SIGNAL_SCORE', '70'))
    MAX_TRADES_PER_DAY = int(os.getenv('MAX_TRADES_PER_DAY', '10'))
    RISK_PERCENTAGE = float(os.getenv('RISK_PERCENTAGE', '2.0'))
    ACCOUNT_BALANCE = float(os.getenv('ACCOUNT_BALANCE', '10000'))
    SYMBOL_SUFFIX = os.getenv('SYMBOL_SUFFIX', '')

class SafetyConfig:
    AUTO_TRADE_ENABLED = os.getenv('AUTO_TRADE_ENABLED', 'false').lower() == 'true'
    DRY_RUN_MODE = os.getenv('DRY_RUN_MODE', 'true').lower() == 'true'

def get_mt5_symbol(scanner_symbol: str) -> str:
    """Convert scanner symbol to MT5 symbol format"""
    if ScannerConfig.SYMBOL_SUFFIX:
        return f"{scanner_symbol}{ScannerConfig.SYMBOL_SUFFIX}"
    return scanner_symbol

def validate_config():
    """Validate essential configuration"""
    if not MT5Config.LOGIN or not MT5Config.PASSWORD or not MT5Config.SERVER:
        raise ValueError("MT5 login credentials not properly configured")
    
    if ScannerConfig.MIN_SIGNAL_SCORE < 50:
        raise ValueError("Minimum signal score should be at least 50")
    
    if ScannerConfig.RISK_PERCENTAGE > 10:
        raise ValueError("Risk percentage should not exceed 10%")
    
    print(f"Configuration loaded:")
    print(f"  MT5 Server: {MT5Config.SERVER}")
    print(f"  Scanner URL: {ScannerConfig.BASE_URL}")
    print(f"  Min Score: {ScannerConfig.MIN_SIGNAL_SCORE}")
    print(f"  Risk %: {ScannerConfig.RISK_PERCENTAGE}")
    print(f"  Auto Trade: {SafetyConfig.AUTO_TRADE_ENABLED}")
    print(f"  Dry Run: {SafetyConfig.DRY_RUN_MODE}")