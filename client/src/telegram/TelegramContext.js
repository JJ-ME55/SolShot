import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * Resolve the Mini App start parameter from the three sources it can arrive on:
 *   1. window.Telegram.WebApp.initDataUnsafe.start_param  ← canonical for t.me/?startapp= links
 *   2. ?tgWebAppStartParam= query param on the URL itself ← fallback if SDK init lagged
 *   3. ?startapp= query param ← when bot uses `web_app:` buttons with a direct URL
 *      (we control the URL there, so we use our own param name)
 *
 * Source 3 is needed for Dynamic silent-auth: bot.js mints a JWT and sends a
 * `web_app:` button with `?telegramAuthToken=<jwt>&startapp=<deeplink>`. Without
 * checking this URL param, deep links break in the silent-auth path.
 */
function resolveStartParam(tg) {
  const fromSdk = tg?.initDataUnsafe?.start_param || '';
  if (fromSdk) return fromSdk;
  try {
    const qs = new URLSearchParams(window.location.search);
    return qs.get('tgWebAppStartParam') || qs.get('startapp') || '';
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

    // Force TG's own chrome (header bar, status bar background) to match our
    // dark CRT theme, regardless of whether the user has TG in light or dark
    // mode. We INTENTIONALLY don't sync to themeParams — the amber-on-dark
    // CRT aesthetic is part of the brand identity, and a white TG header
    // above our dark game looks broken. setHeaderColor + setBackgroundColor
    // require Bot API 6.1+ (2022), universally supported.
    const BG_DEEP = '#0e1209'; // matches --bg-deep CSS token
    if (tg.setHeaderColor) {
      try { tg.setHeaderColor(BG_DEEP); } catch (_) { /* ignore — older client */ }
    }
    if (tg.setBackgroundColor) {
      try { tg.setBackgroundColor(BG_DEEP); } catch (_) { /* ignore */ }
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
