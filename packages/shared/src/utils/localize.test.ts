import { describe, expect, it } from 'vitest';
import { isLocalizedMap, localize, missingLocales } from './localize';

const full = { 'pt-BR': 'Evento online', en: 'Online event', es: 'Evento en línea', 'zh-CN': '线上活动' };

describe('localize', () => {
  it('returns the requested locale when present', () => {
    expect(localize(full, 'en')).toBe('Online event');
    expect(localize(full, 'zh-CN')).toBe('线上活动');
  });

  it('falls back to pt-BR for a missing or empty translation', () => {
    expect(localize({ 'pt-BR': 'Equipe', en: '' }, 'en')).toBe('Equipe');
    expect(localize({ 'pt-BR': 'Equipe', en: '   ' }, 'en')).toBe('Equipe');
    expect(localize({ 'pt-BR': 'Equipe' }, 'es')).toBe('Equipe');
  });

  it('treats a plain string as pt-BR-only legacy content', () => {
    expect(localize('Comitê Científico', 'en')).toBe('Comitê Científico');
  });

  it('keeps null and undefined as null', () => {
    expect(localize(null, 'en')).toBeNull();
    expect(localize(undefined, 'en')).toBeNull();
  });

  it('does not treat an object without pt-BR as a map', () => {
    expect(isLocalizedMap({ en: 'x' })).toBe(false);
    expect(isLocalizedMap(full)).toBe(true);
    expect(isLocalizedMap('x')).toBe(false);
    expect(isLocalizedMap(null)).toBe(false);
  });
});

describe('missingLocales', () => {
  const all = ['pt-BR', 'en', 'es', 'zh-CN'] as const;

  it('reports every non-source locale for a plain string', () => {
    expect(missingLocales('Equipe', all)).toEqual(['en', 'es', 'zh-CN']);
  });

  it('reports only the gaps, counting empty strings as gaps', () => {
    expect(missingLocales({ 'pt-BR': 'a', en: 'b', es: '' }, all)).toEqual(['es', 'zh-CN']);
    expect(missingLocales(full, all)).toEqual([]);
  });
});
