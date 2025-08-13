import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation: React.FC = () => {
  const location = useLocation();

  return (
    <nav className="navigation">
      <div className="nav-brand">
        <img src="/gapstock_logo_pencil_scatchy.png" alt="gapstock logo" className="nav-logo" />
      </div>
      <div className="nav-links">
        <Link 
          to="/" 
          className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
        >
          Gap Scanner
        </Link>
        <Link 
          to="/charts" 
          className={`nav-link ${location.pathname === '/charts' ? 'active' : ''}`}
        >
          Charts
        </Link>
        <Link 
          to="/pre-market" 
          className={`nav-link ${location.pathname === '/pre-market' ? 'active' : ''}`}
        >
          Pre-Market
        </Link>
        <Link 
          to="/happy-twists" 
          className={`nav-link ${location.pathname === '/happy-twists' ? 'active' : ''}`}
        >
          Happy Twists
        </Link>
      </div>
    </nav>
  );
};

export default Navigation;