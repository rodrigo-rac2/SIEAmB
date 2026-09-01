import type { EventTheme } from '@sieamb/shared';
import type { CSSProperties } from 'react';

const TOKEN_MAP: Record<keyof EventTheme, string> = {
  primary: '--color-primary',
  primaryDark: '--color-primary-dark',
  primaryLight: '--color-primary-light',
  accent: '--color-accent',
  accentLight: '--color-accent-light',
  headingFont: '--font-heading',
  bodyFont: '--font-body',
};

/**
 * Converts an event theme into CSS custom-property overrides. Applied as
 * inline style on the page wrapper, so everything inside the edition's layout
 * picks the edition palette while defaults in tokens.css remain the fallback.
 */
export function eventThemeVars(theme: EventTheme | null | undefined): CSSProperties {
  if (!theme) return {};
  const vars: Record<string, string> = {};
  for (const [key, cssVar] of Object.entries(TOKEN_MAP) as [keyof EventTheme, string][]) {
    const value = theme[key];
    if (value) vars[cssVar] = value;
  }
  return vars as CSSProperties;
}
