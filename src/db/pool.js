import pg from 'pg';
import env from '../config/env.js';
import logger from '../utils/logger.js';


const { Pool } = pg;

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle database client', {
    error: err.message,
  });
});

export default pool;
