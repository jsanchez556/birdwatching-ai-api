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
    plan: row.plan || 'FREE',
    profileImageKey: row.profile_image_key || null,
    suspendedAt: row.suspended_at || null,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const USER_SELECT = `
  SELECT
    users.id,
    users.email,
    users.name,
    users.role,
    users.profile_image_key,
    users.suspended_at,
    plans.name AS plan,
    users.password_hash,
    users.created_at,
    users.updated_at
  FROM users
  LEFT JOIN user_subscriptions
    ON user_subscriptions.user_id = users.id
  LEFT JOIN plans
    ON plans.id = user_subscriptions.plan_id
`;

class UserQueries {
  async create({ email, name, passwordHash }) {
    try {
      const query = `
        SELECT
          inserted.id,
          inserted.email,
          inserted.name,
          inserted.role,
          inserted.profile_image_key,
          inserted.suspended_at,
          plans.name AS plan,
          inserted.password_hash,
          inserted.created_at,
          inserted.updated_at
        FROM create_user($1, $2, $3) AS inserted
        LEFT JOIN user_subscriptions
          ON user_subscriptions.user_id = inserted.id
        LEFT JOIN plans
          ON plans.id = user_subscriptions.plan_id
      `;
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
    const query = `${USER_SELECT} WHERE users.email = $1 LIMIT 1`;
    const result = await pool.query(query, [email]);
    return mapUser(result.rows[0]);
  }

  async findById(id) {
    const query = `${USER_SELECT} WHERE users.id = $1 LIMIT 1`;
    const result = await pool.query(query, [id]);
    return mapUser(result.rows[0]);
  }

  async updateProfile({ userId, name }) {
    const result = await pool.query(
      `SELECT
        updated_user.id,
        updated_user.email,
        updated_user.name,
        updated_user.role,
        updated_user.profile_image_key,
        plans.name AS plan,
        updated_user.password_hash,
        updated_user.created_at,
        updated_user.updated_at
      FROM update_user_profile($1, $2) AS updated_user
      LEFT JOIN user_subscriptions
        ON user_subscriptions.user_id = updated_user.id
      LEFT JOIN plans
        ON plans.id = user_subscriptions.plan_id`,
      [userId, name]
    );

    return mapUser(result.rows[0]);
  }

  async updateProfileImage({ userId, profileImageKey }) {
    const result = await pool.query(
      `SELECT
        updated_user.id,
        updated_user.email,
        updated_user.name,
        updated_user.role,
        updated_user.profile_image_key,
        plans.name AS plan,
        updated_user.password_hash,
        updated_user.created_at,
        updated_user.updated_at
      FROM update_user_profile_image($1, $2) AS updated_user
      LEFT JOIN user_subscriptions
        ON user_subscriptions.user_id = updated_user.id
      LEFT JOIN plans
        ON plans.id = user_subscriptions.plan_id`,
      [userId, profileImageKey]
    );

    return mapUser(result.rows[0]);
  }
}

export default new UserQueries();
