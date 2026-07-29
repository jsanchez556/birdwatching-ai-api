import { readFileSync } from 'node:fs';

const SSL_MODES = new Set(['disable', 'require', 'verify-full']);

function decodeCa({ caBase64, caFile, readFile = readFileSync }) {
  if (caBase64 && caFile) {
    throw new Error('Configure only one of DATABASE_SSL_CA_BASE64 or DATABASE_SSL_CA_FILE');
  }

  if (caBase64) {
    const normalized = String(caBase64).replace(/\s/g, '');
    const decoded = Buffer.from(normalized, 'base64');
    const roundTrip = decoded.toString('base64').replace(/=+$/, '');
    if (!normalized || roundTrip !== normalized.replace(/=+$/, '')) {
      throw new Error('DATABASE_SSL_CA_BASE64 must contain a base64-encoded CA certificate');
    }
    return decoded.toString('utf8');
  }

  return caFile ? readFile(caFile, 'utf8') : undefined;
}

function getPostgresTlsConfig(source = process.env, { readFile } = {}) {
  const nodeEnv = source.NODE_ENV || 'development';
  const mode = source.DATABASE_SSL_MODE
    || (nodeEnv === 'production' ? 'verify-full' : 'disable');

  if (!SSL_MODES.has(mode)) {
    throw new Error('DATABASE_SSL_MODE must be disable, require, or verify-full');
  }

  const ca = decodeCa({
    caBase64: source.DATABASE_SSL_CA_BASE64,
    caFile: source.DATABASE_SSL_CA_FILE,
    readFile,
  });

  if (mode === 'disable' && ca) {
    throw new Error('A database CA cannot be configured when DATABASE_SSL_MODE=disable');
  }

  if (mode === 'require') {
    return { rejectUnauthorized: false };
  }

  if (mode === 'verify-full') {
    return {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    };
  }

  return false;
}

export {
  SSL_MODES,
  getPostgresTlsConfig,
};
