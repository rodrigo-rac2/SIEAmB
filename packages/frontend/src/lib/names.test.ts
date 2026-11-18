import { describe, expect, it } from 'vitest';
import { firstName } from './names';

describe('firstName', () => {
  it.each([
    ['Maria Clara de Souza', 'Maria'],
    ['  Rodrigo   Alves Costa ', 'Rodrigo'],
    ['Profa. Viviane Farias', 'Viviane'],
    ['Prof. Dr. João Lima', 'João'],
    ['DRA Ana', 'Ana'],
    ['Drª. Lara Souza', 'Lara'],
    ['Najara', 'Najara'],
    // A name that only looks like a title at its start is a name.
    ['Meire Santos', 'Meire'],
    ['Dr.', ''],
    ['', ''],
    ['   ', ''],
  ])('%j gives %j', (full, first) => {
    expect(firstName(full)).toBe(first);
  });
});
