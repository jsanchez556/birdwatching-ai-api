import pg from 'pg';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { getPostgresTlsConfig } from './postgresTls.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: getPostgresTlsConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle database client', {
    code: typeof err?.code === 'string' ? err.code : 'DATABASE_CLIENT_ERROR',
  });
});

export default pool;
