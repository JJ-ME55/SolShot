import io from 'socket.io-client'

const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5001'

// Include Telegram initData as auth payload if running inside Telegram
const tgInitData = window.Telegram?.WebApp?.initData || null;

export const socket = io(serverUrl, {
  auth: tgInitData ? { telegramInitData: tgInitData } : {},
})
