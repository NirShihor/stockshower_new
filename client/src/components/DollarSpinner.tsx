import React from 'react';
import './DollarSpinner.css';

interface DollarSpinnerProps {
  size?: number;
}

const DollarSpinner: React.FC<DollarSpinnerProps> = ({ size = 60 }) => {
  return (
    <div 
      className="dollar-spinner-container"
      style={{
        width: `${size * 2}px`,
        height: `${size * 2}px`
      }}
    >
      <div 
        className="dollar-spinner" 
        style={{ 
          fontSize: `${size}px`,
          lineHeight: `${size}px`
        }}
      >
        $
      </div>
    </div>
  );
};

export default DollarSpinner;