import { sanitizeHandle, validateHandle } from '../handleValidation';

describe('sanitizeHandle', () => {
  test('trims leading and trailing whitespace', () => {
    expect(sanitizeHandle('  Sniper  ')).toBe('Sniper');
  });

  test('strips control characters', () => {
    expect(sanitizeHandle('Sni\x00per\x1f')).toBe('Sniper');
  });

  test('preserves valid characters untouched', () => {
    expect(sanitizeHandle('Cool_Name_99')).toBe('Cool_Name_99');
  });

  test('preserves case exactly as typed', () => {
    expect(sanitizeHandle('SniperElite')).toBe('SniperElite');
  });

  test('returns empty string for all-whitespace input', () => {
    expect(sanitizeHandle('   ')).toBe('');
  });
});

describe('validateHandle', () => {
  test('accepts valid 3-char handle', () => {
    const r = validateHandle('Ace');
    expect(r.valid).toBe(true);
    expect(r.sanitized).toBe('Ace');
    expect(r.error).toBeNull();
  });

  test('accepts valid 12-char handle', () => {
    const r = validateHandle('abcdefghijkl');
    expect(r.valid).toBe(true);
  });

  test('rejects handle shorter than 3 characters', () => {
    const r = validateHandle('Ab');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/3/);
  });

  test('rejects empty string', () => {
    const r = validateHandle('');
    expect(r.valid).toBe(false);
  });

  test('rejects handle longer than 12 characters', () => {
    const r = validateHandle('abcdefghijklm');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/12/);
  });

  test('rejects handle with spaces', () => {
    const r = validateHandle('Bad Name');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/letters|numbers|underscore/i);
  });

  test('rejects handle with special characters', () => {
    const r = validateHandle('No@Way!');
    expect(r.valid).toBe(false);
  });

  test('allows underscores', () => {
    const r = validateHandle('Cool_Name');
    expect(r.valid).toBe(true);
  });

  test('sanitizes before validating (trims whitespace)', () => {
    const r = validateHandle('  Ace  ');
    expect(r.valid).toBe(true);
    expect(r.sanitized).toBe('Ace');
  });

  test('sanitizes before validating (strips control chars)', () => {
    const r = validateHandle('Sni\x00per');
    expect(r.valid).toBe(true);
    expect(r.sanitized).toBe('Sniper');
  });
});
