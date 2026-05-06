# SolShot — Telegram Mini App Setup Guide

## Prerequisites

- SolShot server deployed and accessible via HTTPS
- A Telegram account

## Step 1: Create a Bot with BotFather

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Choose a display name (e.g., "SolShot")
4. Choose a username (e.g., `solshot_game_bot`) — must end with `bot`
5. BotFather will give you a **bot token** — save this securely

## Step 2: Set Environment Variable

Add the bot token to your server environment:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

The server middleware at `server/middleware/telegram.js` uses this to validate `initData` HMAC-SHA256 signatures.

## Step 3: Create the Mini App

1. In BotFather, send `/newapp`
2. Select your bot
3. Provide the following:
   - **Title:** SolShot
   - **Description:** Artillery combat on Solana
   - **Photo:** Upload a 640x360 screenshot or promo image
   - **Web App URL:** `https://your-domain.com` (your deployed client URL)
4. Optionally set a short name with `/setdomain`

## Step 4: Configure Bot Commands (Optional)

Send `/setcommands` to BotFather and add:

```
play - Launch SolShot
```

## Step 5: Add Inline Button (Optional)

To launch the game via an inline button in your bot's chat:

1. Send `/setmenubutton` to BotFather
2. Select your bot
3. Choose "Web App"
4. Enter the URL: `https://your-domain.com`
5. Enter button text: "PLAY SOLSHOT"

## Step 6: Wire Server Middleware

In your Socket.IO server initialization, add the Telegram middleware:

```javascript
const { telegramSocketMiddleware } = require('./middleware/telegram');

io.use(telegramSocketMiddleware);
```

This validates Telegram `initData` on socket connection and attaches `socket.telegramUser` + `socket.isTelegram` for authenticated Telegram users.

## Architecture Notes

- **Dual-mode:** The app detects Telegram via `window.Telegram?.WebApp` and runs in both browser and Telegram
- **Wallet still required:** Telegram identity is supplementary. Users must connect a Solana wallet to play wagered matches
- **Design preserved:** SolShot's military-tech CSS overrides Telegram theme variables
- **Back button:** Native Telegram back button is wired to navigate back to menu on non-menu screens
- **Viewport:** Layout adapts from fixed 16:9 to fluid height inside Telegram
- **Socket auth:** Client sends `initData` as socket auth payload; server validates HMAC-SHA256

## Testing

### In Browser
The app should work exactly as before. `window.Telegram?.WebApp` returns undefined, so all Telegram code is a no-op.

### In Telegram
1. Open your bot in Telegram
2. Tap the menu button or send `/play`
3. The Mini App opens in Telegram's WebView
4. Verify: back button shows on non-menu screens, viewport fills correctly

## Security

- `initData` is validated server-side using HMAC-SHA256 per Telegram's official spec
- Auth date is checked (24-hour expiry)
- Bot token is NEVER exposed to the client
- Invalid `initData` is logged but doesn't block connection (graceful degradation)
