// TEMPORARY: booting straight into BasketballScreen for v0 prototype testing.
// To revert: `git checkout -- client/src/index.js`
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BasketballScreen } from './games/basketball/BasketballScreen';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BasketballScreen />
  </React.StrictMode>
);
