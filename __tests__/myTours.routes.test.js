import { jest } from '@jest/globals'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import HttpError from '../src/utils/httpError.js'

const service = {
  list: jest.fn(), getById: jest.fn(), create: jest.fn(), update: jest.fn(), getReferences: jest.fn(),
}

await jest.unstable_mockModule('../src/config/env.js', () => ({
  default: { jwtSecret: 'my-tours-secret', jwtExpiresIn: '1h' },
}))
await jest.unstable_mockModule('../src/services/myTours.service.js', () => ({ default: service }))
await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const { default: routes } = await import('../src/api/routes/myTours.routes.js')
const { default: errorMiddleware } = await import('../src/api/middleware/error.middleware.js')

const app = express()
app.use(express.json())
app.use('/my-tours', routes)
app.use(errorMiddleware)

function authorization(role, id = '7') {
  return `Bearer ${jwt.sign({ email: `${id}@example.test`, role }, 'my-tours-secret', { subject: id })}`
}

beforeEach(() => {
  jest.clearAllMocks()
  service.list.mockResolvedValue({ data: { items: [] }, meta: { page: 1, limit: 25, total: 0, totalPages: 0 } })
  service.getById.mockResolvedValue({ entity: { id: 4 } })
  service.create.mockResolvedValue({ entity: { id: 4, createdByUserId: 7 } })
  service.update.mockResolvedValue({ entity: { id: 4 } })
  service.getReferences.mockResolvedValue({ countries: [], zones: [], nodes: [] })
})

test('requires authentication and guide/admin role', async () => {
  expect((await request(app).get('/my-tours')).statusCode).toBe(401)
  expect((await request(app).get('/my-tours').set('Authorization', authorization('customer'))).statusCode).toBe(403)
  expect((await request(app).get('/my-tours').set('Authorization', authorization('tour guide'))).statusCode).toBe(200)
  expect((await request(app).get('/my-tours').set('Authorization', authorization('admin', '1'))).statusCode).toBe(200)
})

test('passes authenticated identity to create and rejects creator mass assignment', async () => {
  const tour = {
    nodeId: 2, name: 'Night forest', type: 'Night walk', price: 75,
    durationValue: 3, durationUnit: 'hours', maxParticipants: 6,
    tourType: 'unscheduled', difficulty: 'easy',
  }
  const response = await request(app).post('/my-tours')
    .set('Authorization', authorization('tour guide')).send(tour)
  expect(response.statusCode).toBe(201)
  expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ id: '7', role: 'tour guide' }), tour)

  const rejected = await request(app).post('/my-tours')
    .set('Authorization', authorization('tour guide')).send({ ...tour, createdByUserId: 99 })
  expect(rejected.statusCode).toBe(400)
  expect(service.create).toHaveBeenCalledTimes(1)
})

test('preserves a service ownership denial as forbidden for direct access', async () => {
  service.getById.mockRejectedValue(new HttpError(403, 'You do not have access to this tour.', { code: 'FORBIDDEN' }))
  const response = await request(app).get('/my-tours/9')
    .set('Authorization', authorization('tour guide'))
  expect(response.statusCode).toBe(403)
})

test('validates direct IDs and tour updates before service execution', async () => {
  expect((await request(app).get('/my-tours/nope').set('Authorization', authorization('tour guide'))).statusCode).toBe(400)
  const invalid = await request(app).patch('/my-tours/4')
    .set('Authorization', authorization('tour guide')).send({ type: 'Cruise' })
  expect(invalid.statusCode).toBe(400)
  expect(service.update).not.toHaveBeenCalled()
})
