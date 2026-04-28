import crypto from 'crypto';

/**
 * Validate Telegram Mini App initData using HMAC-SHA256.
 *
 * Per Telegram docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * 1. Create HMAC-SHA256 of bot token with key "WebAppData"
 * 2. Create HMAC-SHA256 of the data-check-string with the above key
 * 3. Compare with the hash from initData
 *
 * @param {string} initData - The raw initData string from Telegram WebApp
 * @returns {{ valid: boolean, user: object|null }} Validation result + user data
 */
function validateTelegramInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping validation');
    return { valid: false, user: null };
  }

  if (!initData || typeof initData !== 'string') {
    return { valid: false, user: null };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      return { valid: false, user: null };
    }

    // Remove hash from params and sort alphabetically
    params.delete('hash');
    const entries = [...params.entries()];
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

    // HMAC-SHA256 of bot token with key "WebAppData"
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // HMAC-SHA256 of data-check-string with the secret key
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // D7: Use timing-safe comparison to prevent timing side-channel attacks
    const computedBuf = Buffer.from(computedHash, 'hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const valid = computedBuf.length === hashBuf.length && crypto.timingSafeEqual(computedBuf, hashBuf);

    // Extract user data
    let user = null;
    const userStr = params.get('user');
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch (_) { /* ignore */ }
    }

    // Check auth_date is not too old (allow 24 hours)
    const authDate = parseInt(params.get('auth_date'), 10);
    if (authDate) {
      const now = Math.floor(Date.now() / 1000);
      if (now - authDate > 86400) {
        return { valid: false, user: null };
      }
    }

    return { valid, user };
  } catch (err) {
    console.error('[Telegram] Validation error:', err.message);
    return { valid: false, user: null };
  }
}

/**
 * Socket.IO middleware to validate Telegram initData on connection.
 * Attaches telegramUser to socket if valid.
 */
function telegramSocketMiddleware(socket, next) {
  const initData = socket.handshake.auth?.telegramInitData;

  if (!initData) {
    // Not a Telegram connection — proceed normally
    return next();
  }

  const { valid, user } = validateTelegramInitData(initData);

  if (valid && user) {
    socket.telegramUser = user;
    socket.isTelegram = true;
    console.log(`[Telegram] Validated user: ${user.first_name} (ID: ${user.id})`);
  } else if (process.env.TELEGRAM_BOT_TOKEN) {
    // Only warn if bot token is set (meaning validation should work)
    console.warn('[Telegram] Invalid initData received');
  }

  // Always proceed — Telegram auth is supplementary, not required
  return next();
}

export {
  validateTelegramInitData,
  telegramSocketMiddleware,
};
