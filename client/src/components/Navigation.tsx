import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation: React.FC = () => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <nav className="navigation">
      <div className="nav-brand">
        <img src="/gapstock_logo_pencil_scatchy.png" alt="gapstock logo" className="nav-logo" />
      </div>
      
      {/* Hamburger Menu Button */}
      <button 
        className="hamburger-menu" 
        onClick={toggleMenu}
        aria-label="Toggle navigation menu"
      >
        {isMenuOpen ? (
          <span className="hamburger-close">✕</span>
        ) : (
          <img 
            src="/hamburger_pencil.png" 
            alt="Menu" 
            className="hamburger-icon"
            style={{ width: '24px', height: '24px' }}
          />
        )}
      </button>
      
      {/* Navigation Links */}
      <div 
        className={`nav-links ${isMenuOpen ? 'nav-links-open' : ''}`}
        onClick={closeMenu}
      >
        <Link 
          to="/" 
          className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
          onClick={closeMenu}
        >
          Gap Scanner
        </Link>
        <Link 
          to="/charts" 
          className={`nav-link ${location.pathname === '/charts' ? 'active' : ''}`}
          onClick={closeMenu}
        >
          Charts
        </Link>
        <Link 
          to="/pre-market" 
          className={`nav-link ${location.pathname === '/pre-market' ? 'active' : ''}`}
          onClick={closeMenu}
        >
          Pre-Market
        </Link>
        <Link 
          to="/happy-twists" 
          className={`nav-link ${location.pathname === '/happy-twists' ? 'active' : ''}`}
          onClick={closeMenu}
        >
          Happy Twists
        </Link>
        <Link 
          to="/analysis" 
          className={`nav-link ${location.pathname === '/analysis' ? 'active' : ''}`}
          onClick={closeMenu}
        >
          Analysis
        </Link>
        <Link 
          to="/stock-scan" 
          className={`nav-link ${location.pathname === '/stock-scan' ? 'active' : ''}`}
          onClick={closeMenu}
        >
          Stock Scan
        </Link>
        <Link 
          to="/circuit-breaker" 
          className={`nav-link ${location.pathname === '/circuit-breaker' ? 'active' : ''}`}
          onClick={closeMenu}
        >
          Circuit Breaker
        </Link>
        <Link 
          to="/ai-top-trades" 
          className={`nav-link ${location.pathname === '/ai-top-trades' ? 'active' : ''}`}
          onClick={closeMenu}
        >
          AI Top Trades
        </Link>
      </div>
      
      {/* Overlay for mobile */}
      {isMenuOpen && <div className="nav-overlay" onClick={closeMenu}></div>}
    </nav>
  );
};

export default Navigation;