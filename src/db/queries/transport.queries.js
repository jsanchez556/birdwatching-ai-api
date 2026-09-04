import pool from '../pool.js';

function vehicleFromRow(row) {
  return row && {
    id: Number(row.id), code: row.code, name: row.name, description: row.description,
    vehicleType: row.vehicle_type, imagePath: row.image_path,
    passengerCapacity: Number(row.passenger_capacity), luggageCapacity: Number(row.luggage_capacity),
    pricePerKm: row.price_per_km, minimumFare: row.minimum_fare,
    currency: row.currency, isActive: row.is_active, displayOrder: Number(row.display_order),
  };
}

class TransportQueries {
  async listEligibleVehicles({ passengers, luggage }) {
    const result = await pool.query(
      `SELECT * FROM transport_vehicles
       WHERE is_active = true AND passenger_capacity >= $1 AND luggage_capacity >= $2
       ORDER BY display_order, id`, [passengers, luggage]
    );
    return result.rows.map(vehicleFromRow);
  }

  async getVehicle(id) {
    const result = await pool.query('SELECT * FROM transport_vehicles WHERE id = $1 AND is_active = true', [id]);
    return vehicleFromRow(result.rows[0]);
  }

  async getCheckoutContext(userId) {
    const result = await pool.query(
      `SELECT u.name, u.email, us.billing_provider
       FROM users u LEFT JOIN user_subscriptions us ON us.user_id = u.id
       WHERE u.id = $1 ORDER BY us.updated_at DESC NULLS LAST LIMIT 1`, [userId]
    );
    return result.rows[0] || null;
  }

  async createBooking(values) {
    const result = await pool.query(
      `SELECT * FROM create_transport_booking(
        $1,$2::uuid,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12::jsonb,
        $13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21
      )`, values
    );
    return result.rows[0] || null;
  }
}

export default new TransportQueries();
