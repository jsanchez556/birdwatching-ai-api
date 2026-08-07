import { jest } from '@jest/globals'

const queries = { list: jest.fn(), getById: jest.fn() }
const maintenance = { create: jest.fn(), update: jest.fn() }

await jest.unstable_mockModule('../src/db/queries/adminMaintenance.queries.js', () => ({ default: queries }))
await jest.unstable_mockModule('../src/services/admin/adminMaintenance.service.js', () => ({
  default: maintenance,
  normalizeListQuery: (resource, query = {}) => ({
    search: query.search || '', page: Number(query.page || 1), limit: Number(query.limit || 25),
    offset: (Number(query.page || 1) - 1) * Number(query.limit || 25),
    type: query.type || null, isActive: query.status ? query.status === 'active' : null,
  }),
}))

const { default: service } = await import('../src/services/myTours.service.js')

beforeEach(() => jest.clearAllMocks())

test('guide lists only owned tours and pagination total comes from that scoped query', async () => {
  queries.list.mockResolvedValue({ rows: [{ id: 4, createdByUserId: 7 }], total: 1 })
  const result = await service.list({ id: '7', role: 'tour guide' }, { search: 'night', status: 'active' })
  expect(queries.list).toHaveBeenCalledWith('tours', expect.objectContaining({
    ownerId: 7, search: 'night', isActive: true,
  }))
  expect(result.meta.total).toBe(1)
})

test('administrator tour list has no owner scope', async () => {
  queries.list.mockResolvedValue({ rows: [], total: 0 })
  await service.list({ id: '1', role: 'admin' }, {})
  expect(queries.list).toHaveBeenCalledWith('tours', expect.objectContaining({ ownerId: null }))
})

test('guide receives forbidden for another owner while an admin can edit it', async () => {
  queries.getById.mockResolvedValue({ id: 8, createdByUserId: 9 })
  await expect(service.getById({ id: '7', role: 'tour guide' }, 8)).rejects.toMatchObject({
    status: 403, code: 'FORBIDDEN',
  })
  maintenance.update.mockResolvedValue({ entity: { id: 8 } })
  await expect(service.update({ id: '1', role: 'admin' }, 8, { name: 'Updated' }))
    .resolves.toEqual({ entity: { id: 8 } })
})

test('creation delegates server-side authenticated ownership and ignores client ownership fields upstream', async () => {
  maintenance.create.mockResolvedValue({ entity: { id: 10, createdByUserId: 7 } })
  await service.create({ id: '7', role: 'tour guide' }, { name: 'Forest walk' })
  expect(maintenance.create).toHaveBeenCalledWith('tours', { name: 'Forest walk' }, {
    authUser: { id: '7', role: 'tour guide' },
  })
})
