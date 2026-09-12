import { describe, expect, it } from 'vitest';
import { buildQueryString } from './client';

describe('buildQueryString', () => {
  it('encodes ordinary parameters', () => {
    expect(buildQueryString({ session_key: 9912, driver_number: 1 })).toBe(
      'session_key=9912&driver_number=1',
    );
  });

  it('leaves range operators in the key literal', () => {
    /*
     * Verified against the live API: percent-encoding the operator to
     * `date%3E%3D` returns 404, while the raw form returns data. This test
     * exists so that never regresses silently — it would only show up as an
     * empty telemetry chart.
     */
    const qs = buildQueryString({
      'date>=': '2025-09-07T13:43:49.709Z',
      'date<=': '2025-09-07T13:45:12.637Z',
    });
    expect(qs).toContain('date>=');
    expect(qs).toContain('date<=');
    expect(qs).not.toContain('%3E');
    expect(qs).not.toContain('%3C');
  });

  it('uses the operator itself as the separator, not an extra equals', () => {
    // The parameter is really the key `date>` followed by its value, so adding
    // a second "=" would produce `date>==...` and break the filter.
    const qs = buildQueryString({ 'date>=': '2025-09-07T13:43:49.709Z' });
    expect(qs).toBe('date>=2025-09-07T13%3A43%3A49.709Z');
    expect(qs).not.toContain('==');
  });

  it('handles the less-than-or-equal operator the same way', () => {
    expect(buildQueryString({ 'date<=': '2025-01-01T00:00:00Z' })).toBe(
      'date<=2025-01-01T00%3A00%3A00Z',
    );
  });

  it('builds the exact shape a telemetry request uses', () => {
    const qs = buildQueryString({
      session_key: 9912,
      driver_number: 1,
      'date>=': '2025-09-07T13:43:49.709Z',
      'date<=': '2025-09-07T13:45:12.637Z',
    });
    expect(qs).toBe(
      'session_key=9912&driver_number=1' +
        '&date>=2025-09-07T13%3A43%3A49.709Z' +
        '&date<=2025-09-07T13%3A45%3A12.637Z',
    );
  });

  it('skips undefined values', () => {
    expect(buildQueryString({ a: 1, b: undefined, c: 2 })).toBe('a=1&c=2');
  });

  it('returns an empty string for an empty query', () => {
    expect(buildQueryString({})).toBe('');
  });
});
