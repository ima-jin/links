import { describe, expect, it } from 'vitest';
import { extractDomain, generateId, isValidHandle, isValidUrl, themePresets } from '../utils';

describe('generateId', () => {
  it('produces a prefixed, unique-looking id', () => {
    const a = generateId('page');
    const b = generateId('page');

    expect(a).toMatch(/^page_[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe('isValidHandle', () => {
  it('accepts lowercase alphanumeric + underscore handles between 3 and 30 chars', () => {
    expect(isValidHandle('jin')).toBe(true);
    expect(isValidHandle('jin_2026')).toBe(true);
  });

  it('rejects handles that are too short, too long, or contain invalid characters', () => {
    expect(isValidHandle('ab')).toBe(false);
    expect(isValidHandle('a'.repeat(31))).toBe(false);
    expect(isValidHandle('Jin')).toBe(false);
    expect(isValidHandle('jin-2026')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('accepts well-formed absolute URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('rejects malformed URLs', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });
});

describe('extractDomain', () => {
  it('extracts only the hostname from a referrer, for privacy', () => {
    expect(extractDomain('https://example.com/some/deep/path?query=1')).toBe('example.com');
  });

  it('returns null for a missing or malformed referrer', () => {
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain('not a url')).toBeNull();
  });
});

describe('themePresets', () => {
  it('exposes the five built-in presets with a background/text/button color each', () => {
    for (const name of ['dark', 'light', 'midnight', 'sunset', 'ocean'] as const) {
      expect(themePresets[name]).toMatchObject({
        backgroundColor: expect.any(String),
        textColor: expect.any(String),
        buttonColor: expect.any(String),
      });
    }
  });
});
