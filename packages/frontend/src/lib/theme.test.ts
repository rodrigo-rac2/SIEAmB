import { describe, expect, it } from 'vitest';
import { eventThemeVars } from './theme';

describe('eventThemeVars', () => {
  it('returns empty object for null/undefined theme', () => {
    expect(eventThemeVars(null)).toEqual({});
    expect(eventThemeVars(undefined)).toEqual({});
  });

  it('maps theme fields to CSS custom properties', () => {
    expect(
      eventThemeVars({ primary: '#14536b', primaryDark: '#0c3648', accent: '#c9762d' }),
    ).toEqual({
      '--color-primary': '#14536b',
      '--color-primary-dark': '#0c3648',
      '--color-accent': '#c9762d',
    });
  });

  it('omits empty and missing fields so tokens.css defaults apply', () => {
    expect(eventThemeVars({ primary: '#123456', primaryLight: '' })).toEqual({
      '--color-primary': '#123456',
    });
  });

  it('supports font overrides', () => {
    expect(eventThemeVars({ headingFont: "'Marcellus', serif" })).toEqual({
      '--font-heading': "'Marcellus', serif",
    });
  });
});
