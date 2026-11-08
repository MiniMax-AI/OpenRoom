import { describe, expect, it } from 'vitest';
import { parseAllowedHosts } from '../allowedHosts';

describe('parseAllowedHosts', () => {
  it('returns undefined when unset or blank', () => {
    expect(parseAllowedHosts(undefined)).toBeUndefined();
    expect(parseAllowedHosts('')).toBeUndefined();
    expect(parseAllowedHosts('   ')).toBeUndefined();
  });

  it('splits a comma-separated list and trims entries', () => {
    expect(parseAllowedHosts('example.com, 192.168.1.10 ,10.0.0.1')).toEqual([
      'example.com',
      '192.168.1.10',
      '10.0.0.1',
    ]);
  });

  it('drops empty entries', () => {
    expect(parseAllowedHosts('example.com,,')).toEqual(['example.com']);
    expect(parseAllowedHosts(' , ,')).toBeUndefined();
  });

  it('returns true for "true" (any case) to allow all hosts', () => {
    expect(parseAllowedHosts('true')).toBe(true);
    expect(parseAllowedHosts(' TRUE ')).toBe(true);
  });
});
