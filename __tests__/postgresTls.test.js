import { getPostgresTlsConfig } from '../src/db/postgresTls.js';

describe('PostgreSQL TLS configuration', () => {
  test('defaults production to certificate and hostname verification', () => {
    expect(getPostgresTlsConfig({ NODE_ENV: 'production' })).toEqual({
      rejectUnauthorized: true,
    });
  });

  test('supports a hosting-provider CA without committing a certificate', () => {
    const certificate = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
    expect(getPostgresTlsConfig({
      NODE_ENV: 'production',
      DATABASE_SSL_MODE: 'verify-full',
      DATABASE_SSL_CA_BASE64: Buffer.from(certificate).toString('base64'),
    })).toEqual({
      rejectUnauthorized: true,
      ca: certificate,
    });
  });

  test('supports an explicit temporary compatibility mode', () => {
    expect(getPostgresTlsConfig({
      DATABASE_SSL_MODE: 'require',
    })).toEqual({ rejectUnauthorized: false });
  });

  test.each([
    [{ DATABASE_SSL_MODE: 'invalid' }, /DATABASE_SSL_MODE/],
    [{
      DATABASE_SSL_MODE: 'disable',
      DATABASE_SSL_CA_BASE64: Buffer.from('ca').toString('base64'),
    }, /cannot be configured/],
    [{
      DATABASE_SSL_MODE: 'verify-full',
      DATABASE_SSL_CA_BASE64: Buffer.from('ca').toString('base64'),
      DATABASE_SSL_CA_FILE: '/ca.pem',
    }, /only one/],
  ])('rejects invalid or contradictory configuration', (source, expected) => {
    expect(() => getPostgresTlsConfig(source)).toThrow(expected);
  });
});
