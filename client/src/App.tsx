import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Navigation from './components/Navigation';
import GapScannerPage from './pages/GapScannerPage';
import ChartsPage from './pages/ChartsPage';
import PreMarketPage from './pages/PreMarketPage';

function App() {
  return (
    <Router>
      <div className="App">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<GapScannerPage />} />
            <Route path="/charts" element={<ChartsPage />} />
            <Route path="/pre-market" element={<PreMarketPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
