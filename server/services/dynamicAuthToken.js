/**
 * Dynamic SDK Telegram auth-token minter.
 *
 * Per Dynamic's reference TMA bot (https://github.com/dynamic-labs/telegram-miniapp-dynamic),
 * we mint a JWT containing the user's Telegram identity + an HMAC hash
 * Dynamic can verify against our bot token. The token is appended to the
 * Mini App URL as `?telegramAuthToken=<jwt>` and the SDK's `useTelegramLogin`
 * hook reads it on first load to provision an embedded wallet silently —
 * no popup, no phone number, no OAuth round-trip.
 *
 * The HMAC follows Telegram's standard data-check spec:
 *   secret = SHA-256(bot_token)
 *   hash   = HMAC-SHA256(secret, sorted_data_check_string)
 * Dynamic recomputes this server-side to verify the JWT was minted by
 * the bot we configured in their dashboard.
 */

import jwt from 'jsonwebtoken';
import nodeCrypto from 'crypto';

/**
 * Compute the Telegram auth hash for a user data object.
 * Mirrors the spec at https://core.telegram.org/widgets/login#checking-authorization
 */
function generateTelegramHash(data, botToken) {
  const useData = {
    auth_date: String(data.authDate),
    first_name: data.firstName,
    id: String(data.id),
    last_name: data.lastName,
    photo_url: data.photoURL,
    username: data.username,
  };

  const filtered = Object.entries(useData).reduce((acc, [k, v]) => {
    if (v) acc[k] = v;
    return acc;
  }, {});

  const dataCheckString = Object.entries(filtered)
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n');

  const secret = nodeCrypto.createHash('sha256').update(botToken).digest();
  return nodeCrypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
}

/**
 * Mint a Dynamic-compatible Telegram auth token for a TG user.
 *
 * @param {object} tgUser - Telegram user object (typically ctx.from)
 * @param {number} tgUser.id
 * @param {string} [tgUser.first_name]
 * @param {string} [tgUser.last_name]
 * @param {string} [tgUser.username]
 * @param {string} [tgUser.photo_url]
 * @returns {string|null} URL-safe JWT, or null if bot token missing
 */
export function mintAuthToken(tgUser) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !tgUser?.id) return null;

  const userData = {
    authDate: Math.floor(Date.now() / 1000),
    firstName: tgUser.first_name || '',
    lastName: tgUser.last_name || '',
    username: tgUser.username || '',
    id: tgUser.id,
    photoURL: tgUser.photo_url || '',
  };

  const hash = generateTelegramHash(userData, botToken);
  return jwt.sign({ ...userData, hash }, botToken, { algorithm: 'HS256' });
}
