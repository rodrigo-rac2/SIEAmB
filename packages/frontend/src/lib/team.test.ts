import type { CommitteeMember } from '@sieamb/shared';
import { describe, expect, it } from 'vitest';
import { firstAppearance, groupByRole } from './team';

const member = (id: string, name: string, role: string, sortOrder: number): CommitteeMember => ({
  id,
  eventId: 'evt-x',
  name,
  role,
  isCoordinator: false,
  institution: null,
  bioMd: null,
  photoUrl: null,
  lattesUrl: null,
  orcidUrl: null,
  sortOrder,
});

describe('groupByRole', () => {
  it('keeps roles in first-seen order and members in input order', () => {
    const groups = groupByRole([
      member('1', 'A', 'Comitê Científico', 1),
      member('2', 'B', 'Equipe de Revisores', 2),
      member('3', 'A', 'Equipe de Revisores', 3),
      member('4', 'C', 'Comitê Científico', 4),
    ]);
    expect(groups.map(([role]) => role)).toEqual(['Comitê Científico', 'Equipe de Revisores']);
    expect(groups[0]?.[1].map((m) => m.name)).toEqual(['A', 'C']);
    expect(groups[1]?.[1].map((m) => m.name)).toEqual(['B', 'A']);
  });

  it('returns no groups for an empty list', () => {
    expect(groupByRole([])).toEqual([]);
  });
});

describe('firstAppearance', () => {
  it('is true once per name, independent of the group', () => {
    const first = firstAppearance();
    expect(first('Najara')).toBe(true);
    expect(first('Niklas')).toBe(true);
    expect(first('Najara')).toBe(false);
    expect(first('Najara')).toBe(false);
    expect(first('Niklas')).toBe(false);
  });

  it('does not share state between pages', () => {
    const a = firstAppearance();
    const b = firstAppearance();
    expect(a('X')).toBe(true);
    expect(b('X')).toBe(true);
  });
});
