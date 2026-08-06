import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './ui/theme/tokens.css';
import './index.css';
import { bootPlatform } from './app/platform/boot';

// A8: platform layer (viewport vars, persistence flush points, SW, music).
bootPlatform();

// Read-only debug handle ("beneath the floorboards" philosophy, AAA 7.18):
// lets smoke tests and support sessions inspect live state. Not a save
// surface — persistence still flows through the store subscription.
import { useManorStore } from './app/store';
(window as unknown as Record<string, unknown>).__manorStore = useManorStore;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
