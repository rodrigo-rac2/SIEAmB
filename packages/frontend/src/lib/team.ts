import { sourceText, type CommitteeMember, type LocalizedText } from '@sieamb/shared';

/** Groups members by role (keyed on the pt-BR text), keeping the order in which roles first appear (fixture order). */
export function groupByRole(members: CommitteeMember[]): [LocalizedText, CommitteeMember[]][] {
  const groups: [LocalizedText, CommitteeMember[]][] = [];
  for (const m of members) {
    const g = groups.find(([role]) => sourceText(role) === sourceText(m.role));
    if (g) g[1].push(m);
    else groups.push([m.role, [m]]);
  }
  return groups;
}

/**
 * A person can sit in several groups of the same page: photo and name repeat,
 * the bio shows only the first time they are presented. Returns a predicate that
 * answers "is this the first time?" and remembers the names it has seen.
 */
export function firstAppearance(): (name: string) => boolean {
  const seen = new Set<string>();
  return (name) => {
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  };
}
