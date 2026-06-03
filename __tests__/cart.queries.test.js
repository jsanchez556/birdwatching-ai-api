import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    error: jest.fn(),
  },
}));

const { default: cartQueries } = await import('../src/db/queries/cart.queries.js');

function cartItemRow(overrides = {}) {
  return {
    id: 12,
    user_id: 7,
    tour_id: 3,
    scheduled_date: '2026-06-12',
    participants: 2,
    needs_transportation: true,
    metadata: { selectedTransportation: 'shared_shuttle' },
    created_at: new Date('2026-05-01T10:00:00.000Z'),
    updated_at: new Date('2026-05-01T10:05:00.000Z'),
    tour_name: 'Monteverde Quetzal Tour',
    tour_description: 'Cloud forest birding.',
    tour_price: '120.00',
    tour_available_slots: 4,
    tour_location: 'Monteverde / Curi-Cancha',
    tour_node: 'Monteverde',
    tour_subnode: 'Curi-Cancha',
    tour_zone: 'Puntarenas',
    tour_duration_hours: 4,
    tour_difficulty: 'moderate',
    ...overrides,
  };
}

describe('CartQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads cart items through the PostgreSQL function', async () => {
    mockQuery.mockResolvedValue({ rows: [cartItemRow()] });

    await expect(cartQueries.getCart(7)).resolves.toEqual({
      settings: {
        itineraryStartDate: null,
        itineraryEndDate: null,
      },
      items: [
        expect.objectContaining({
          id: 12,
          userId: 7,
          tourId: 3,
          scheduledDate: '2026-06-12',
          participants: 2,
          tour: expect.objectContaining({
            name: 'Monteverde Quetzal Tour',
            pricePerPerson: 120,
            availableSlots: 4,
          }),
        }),
      ],
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_tour_cart_items($1)',
      [7]
    );
  });

  it('adds cart items through the PostgreSQL function', async () => {
    mockQuery.mockResolvedValue({ rows: [cartItemRow()] });

    await expect(cartQueries.addItem({
      userId: 7,
      tourId: 3,
      scheduledDate: '2026-06-12',
      participants: 2,
      needsTransportation: true,
      metadata: { selectedTransportation: 'shared_shuttle' },
    })).resolves.toMatchObject({
      id: 12,
      userId: 7,
      tourId: 3,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM upsert_tour_cart_item($1, $2, $3, $4, $5, $6::jsonb)',
      [7, 3, '2026-06-12', 2, true, JSON.stringify({ selectedTransportation: 'shared_shuttle' })]
    );
  });

  it('updates cart items through the PostgreSQL function', async () => {
    mockQuery.mockResolvedValue({ rows: [cartItemRow({ participants: 3 })] });

    await expect(cartQueries.updateItem({
      userId: 7,
      itemId: 12,
      participants: 3,
    })).resolves.toMatchObject({
      id: 12,
      participants: 3,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM update_tour_cart_item($1, $2, $3, $4, $5)',
      [7, 12, null, 3, undefined]
    );
  });

  it('removes cart items through the PostgreSQL function', async () => {
    mockQuery.mockResolvedValue({ rows: [{ removed: true }] });

    await expect(cartQueries.removeItem({ userId: 7, itemId: 12 })).resolves.toBe(true);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT delete_tour_cart_item($1, $2) AS removed',
      [7, 12]
    );
  });
});
