import React, { createContext, useContext, useState, useEffect } from 'react';

const TelegramContext = createContext({
  isTelegram: false,
  webApp: null,
  user: null,
  initData: null,
});

export function TelegramProvider({ children }) {
  const [state, setState] = useState({
    isTelegram: false,
    webApp: null,
    user: null,
    initData: null,
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

    setState({
      isTelegram: true,
      webApp: tg,
      user,
      initData,
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
