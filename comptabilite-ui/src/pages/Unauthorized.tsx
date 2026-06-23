import React from 'react';
import { Link } from 'react-router-dom';

const Unauthorized: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>403 - Unauthorized</h1>
      <p>You do not have permission to view this page.</p>
      <Link to="/" style={{ color: '#4a90e2', textDecoration: 'none' }}>Go back to Dashboard</Link>
    </div>
  );
};

export default Unauthorized;
