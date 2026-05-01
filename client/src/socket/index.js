import io from 'socket.io-client'

const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5001'

// Include Telegram initData as auth payload if running inside Telegram
const tgInitData = window.Telegram?.WebApp?.initData || null;

export const socket = io(serverUrl, {
  auth: tgInitData ? { telegramInitData: tgInitData } : {},
  // Skip the long-poll handshake and go straight to WebSocket. Default
  // socket.io behaviour is polling-first then upgrade, which costs
  // ~150-300ms on the initial connection (one HTTP request + the
  // upgrade probe). All modern mobile + desktop browsers — including
  // the Telegram Mini App webview — support WS natively. If WS fails
  // to connect we'd rather see it fail loudly than silently fall back
  // to higher-latency polling.
  // See: https://socket.io/docs/v4/client-options/#transports
  transports: ['websocket'],
  upgrade: false,
})
