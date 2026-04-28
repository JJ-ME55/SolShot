import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * Resolve the Mini App start parameter from BOTH sources Telegram exposes it on:
 *   1. window.Telegram.WebApp.initDataUnsafe.start_param  ← canonical for app code
 *   2. ?tgWebAppStartParam= query param on the URL itself ← fallback if SDK init lagged
 * Telegram delivers the same value in both places (per Mini Apps spec).
 */
function resolveStartParam(tg) {
  const fromSdk = tg?.initDataUnsafe?.start_param || '';
  if (fromSdk) return fromSdk;
  try {
    const qs = new URLSearchParams(window.location.search);
    return qs.get('tgWebAppStartParam') || '';
  } catch (_) {
    return '';
  }
}

const TelegramContext = createContext({
  isTelegram: false,
  webApp: null,
  user: null,
  initData: null,
  startParam: '',
});

export function TelegramProvider({ children }) {
  // Read start_param synchronously on first render — the SDK populates
  // initDataUnsafe before our bundle executes (script is in <head>).
  // This avoids a render where startParam is undefined and downstream
  // useEffects no-op.
  const initialStartParam = typeof window !== 'undefined'
    ? resolveStartParam(window.Telegram?.WebApp)
    : '';

  const [state, setState] = useState({
    isTelegram: false,
    webApp: null,
    user: null,
    initData: null,
    startParam: initialStartParam,
  });

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    // Signal to Telegram that the app is ready
    tg.ready();

    // Expand to full height
    tg.expand();

    // Request fullscreen for immersive game experience
    if (tg.requestFullscreen) {
      try { tg.requestFullscreen(); } catch (_) { /* ignore */ }
    }

    const user = tg.initDataUnsafe?.user || null;
    const initData = tg.initData || null;
    const startParam = resolveStartParam(tg);

    if (process.env.NODE_ENV !== 'production') {
      // Diagnostic — confirms deep-link routing input is what we expect.
      // Strip when we trust this in production.
      // eslint-disable-next-line no-console
      console.log('[telegram] init', { hasWebApp: !!tg, startParam, version: tg.version });
    }

    setState({
      isTelegram: true,
      webApp: tg,
      user,
      initData,
      startParam,
    });
  }, []);

  return (
    <TelegramContext.Provider value={state}>
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegram() {
  return useContext(TelegramContext);
}

export default TelegramContext;
