import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ArcadePrivyProvider } from '@/wallet/PrivyProvider';
import { App } from '@/App';
import '@/styles/tokens.css';
import '@/styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('No #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ArcadePrivyProvider>
        <App />
      </ArcadePrivyProvider>
    </BrowserRouter>
  </StrictMode>
);
