import { containsProfanity } from './profanity';

/** Strip control chars (U+0000-U+001F, U+007F-U+009F) and trim whitespace. */
export function sanitizeHandle(raw) {
  return raw.replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim();
}

/** Validate a raw handle string. Returns { valid, sanitized, error }. */
export function validateHandle(raw) {
  const sanitized = sanitizeHandle(raw);

  if (sanitized.length < 3) {
    return { valid: false, sanitized, error: 'Min 3 characters' };
  }
  if (sanitized.length > 12) {
    return { valid: false, sanitized, error: 'Max 12 characters' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(sanitized)) {
    return { valid: false, sanitized, error: 'Letters, numbers, and underscores only' };
  }
  if (containsProfanity(sanitized)) {
    return { valid: false, sanitized, error: 'That name is not allowed' };
  }
  return { valid: true, sanitized, error: null };
}
