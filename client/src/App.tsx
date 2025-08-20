import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Navigation from './components/Navigation';
import GapScannerPage from './pages/GapScannerPage';
import ChartsPage from './pages/ChartsPage';
import PreMarketPage from './pages/PreMarketPage';
import HappyTwistsPage from './pages/HappyTwistsPage';
import AnalysisPage from './pages/AnalysisPage';

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
            <Route path="/happy-twists" element={<HappyTwistsPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
