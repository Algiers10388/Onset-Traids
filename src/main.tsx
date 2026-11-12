// Polyfill and protect window.ethereum from extension getter collisions
if (typeof window !== 'undefined') {
  try {
    let _eth = (window as unknown as { ethereum?: unknown }).ethereum;
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      enumerable: true,
      get: () => _eth,
      set: (val) => {
        _eth = val;
      },
    });
  } catch {
    // Ignore if already locked by environment
  }

  window.addEventListener(
    'error',
    (event) => {
      if (
        event &&
        event.message &&
        typeof event.message === 'string' &&
        event.message.includes('Cannot set property ethereum')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
    },
    true
  );
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
