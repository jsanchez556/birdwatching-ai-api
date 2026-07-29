import { createHash } from 'crypto';

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }

  return JSON.stringify(value);
}

function createStableHash(value, algorithm = 'sha256') {
  return createHash(algorithm)
    .update(stableStringify(value))
    .digest('hex');
}

function buildHashKey(prefix, value, options = {}) {
  return `${prefix}:${createStableHash(value, options.algorithm)}`;
}

export {
  buildHashKey,
  createStableHash,
  stableStringify,
};
