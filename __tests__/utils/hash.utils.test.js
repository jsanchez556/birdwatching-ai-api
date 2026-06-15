import {
  buildHashKey,
  createStableHash,
  stableStringify,
} from '../../src/utils/hash.utils.js';

describe('hash utilities', () => {
  it('stringifies object keys deterministically', () => {
    expect(stableStringify({ b: 2, a: 1 }))
      .toBe(stableStringify({ a: 1, b: 2 }));
  });

  it('creates stable hashes for equivalent structured values', () => {
    expect(createStableHash({ filters: { b: 2, a: 1 }, query: 'quetzal' }))
      .toBe(createStableHash({ query: 'quetzal', filters: { a: 1, b: 2 } }));
  });

  it('builds prefixed cache keys', () => {
    expect(buildHashKey('cache', { a: 1 })).toMatch(/^cache:[a-f0-9]{64}$/);
  });
});
