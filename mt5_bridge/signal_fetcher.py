import requests
import logging
from typing import List, Dict, Any, Optional
from config import ScannerConfig

class SignalFetcher:
    def __init__(self):
        self.base_url = ScannerConfig.BASE_URL
        self.session = requests.Session()
        self.logger = logging.getLogger(__name__)
        
    def test_connection(self) -> bool:
        """Test connection to scanner API"""
        try:
            response = self.session.get(f"{self.base_url}/api/health", timeout=5)
            return response.status_code == 200
        except Exception as e:
            self.logger.error(f"Failed to connect to scanner: {e}")
            return False
    
    def get_pending_signals(self, min_score: Optional[float] = None, limit: int = 10) -> List[Dict[str, Any]]:
        """Fetch pending signals from scanner"""
        if min_score is None:
            min_score = ScannerConfig.MIN_SIGNAL_SCORE
            
        try:
            params = {
                'minScore': min_score,
                'limit': limit
            }
            
            response = self.session.get(
                f"{self.base_url}/api/candlestick/signals/pending",
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    signals = data.get('signals', [])
                    self.logger.info(f"Fetched {len(signals)} pending signals")
                    return signals
                else:
                    self.logger.error(f"API error: {data.get('error', 'Unknown error')}")
                    return []
            else:
                self.logger.error(f"HTTP error {response.status_code}: {response.text}")
                return []
                
        except Exception as e:
            self.logger.error(f"Error fetching signals: {e}")
            return []
    
    def get_all_signals(self, symbol: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch all recent signals from scanner"""
        try:
            params = {'limit': limit}
            if symbol:
                params['symbol'] = symbol
                
            response = self.session.get(
                f"{self.base_url}/api/signals",
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                signals = response.json()
                self.logger.info(f"Fetched {len(signals)} signals")
                return signals
            else:
                self.logger.error(f"HTTP error {response.status_code}: {response.text}")
                return []
                
        except Exception as e:
            self.logger.error(f"Error fetching all signals: {e}")
            return []
    
    def filter_actionable_signals(self, signals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter signals that are actionable for trading"""
        actionable = []
        
        for signal in signals:
            score = signal.get('score', 0)
            pattern = signal.get('pattern', {})
            plan = signal.get('plan', {})
            
            # Basic validation
            if score < ScannerConfig.MIN_SIGNAL_SCORE:
                continue
                
            if not pattern.get('name') or not plan.get('direction'):
                continue
                
            if not plan.get('entry') or not plan.get('stop'):
                continue
                
            # Additional filters can be added here
            # - Time-based filters (avoid stale signals)
            # - Symbol-specific filters
            # - Market hours validation
            
            actionable.append(signal)
            
        self.logger.info(f"Found {len(actionable)} actionable signals out of {len(signals)}")
        return actionable