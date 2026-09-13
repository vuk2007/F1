import { describe, expect, it } from 'vitest';
import { confidenceFrom, weakest } from './confidence';

describe('confidenceFrom', () => {
  it('needs many laps for high confidence', () => {
    expect(confidenceFrom(12, 0.2)).toBe('high');
    expect(confidenceFrom(8, 0.2)).toBe('medium');
    expect(confidenceFrom(4, 0.05)).toBe('low');
  });

  it('lets scatter lower the grade but never raise it', () => {
    expect(confidenceFrom(12, 0.5)).toBe('medium');
    expect(confidenceFrom(12, 0.9)).toBe('low');
    expect(confidenceFrom(4, 0.5)).toBe('low');
  });

  it('is low when the scatter is unknown', () => {
    expect(confidenceFrom(20, null)).toBe('low');
  });
});

describe('weakest', () => {
  it('takes the least certain input', () => {
    expect(weakest('high', 'medium', 'high')).toBe('medium');
    expect(weakest('high')).toBe('high');
    expect(weakest()).toBe('low');
  });
});
