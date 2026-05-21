import pool from '../pool.js';
import logger from '../../utils/logger.js';

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role || 'customer',
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class UserQueries {
  async create({ email, name, passwordHash }) {
    try {
      const query = 'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, role, password_hash, created_at, updated_at';
      const result = await pool.query(query, [email, name || null, passwordHash]);
      return mapUser(result.rows[0]);
    } catch (error) {
      logger.warn('Failed to create user', {
        code: error.code,
      });
      throw error;
    }
  }

  async findByEmail(email) {
    const query = 'SELECT id, email, name, role, password_hash, created_at, updated_at FROM users WHERE email = $1 LIMIT 1';
    const result = await pool.query(query, [email]);
    return mapUser(result.rows[0]);
  }

  async findById(id) {
    const query = 'SELECT id, email, name, role, password_hash, created_at, updated_at FROM users WHERE id = $1 LIMIT 1';
    const result = await pool.query(query, [id]);
    return mapUser(result.rows[0]);
  }
}

export default new UserQueries();
