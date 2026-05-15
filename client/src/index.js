// Standalone Keepie Uppies build entry point.
//
// This file is intentionally divergent from `main` — on the
// `arcade/keepie-uppies` branch (Vercel project: sol-shot-keepie-uppies),
// the entire app is just the standalone game. No App.js, no wallet
// provider, no socket — just the Phaser scene.
//
// To re-sync with main one day: `git checkout main -- client/src/index.js`.
//
// Service worker registration is also intentionally omitted: we learned
// today (2026-05-15) that the CRA service worker caches the HTML and
// JS bundle aggressively, which makes it hard to ship fixes to a
// running standalone deploy without manual SW unregistration. Without
// any SW, hard refresh always picks up the latest bundle.
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { KeepieUppiesScreen } from './games/keepie-uppies/KeepieUppiesScreen';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <KeepieUppiesScreen />
  </React.StrictMode>
);
