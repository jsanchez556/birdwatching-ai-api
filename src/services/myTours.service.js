import adminMaintenanceQueries from '../db/queries/adminMaintenance.queries.js';
import adminMaintenanceService, {
  normalizeListQuery,
} from './admin/adminMaintenance.service.js';
import { USER_ROLES } from '../constants/userRoles.js';
import HttpError from '../utils/httpError.js';

function isAdmin(user) {
  return user?.role === USER_ROLES.ADMIN;
}

function ownerScope(user) {
  return isAdmin(user) ? null : Number(user.id);
}

function assertOwned(entity, user) {
  if (!entity) {
    throw new HttpError(404, 'Tour not found.', { code: 'TOUR_NOT_FOUND' });
  }
  if (!isAdmin(user) && Number(entity.createdByUserId) !== Number(user.id)) {
    throw new HttpError(403, 'You do not have access to this tour.', { code: 'FORBIDDEN' });
  }
}

class MyToursService {
  async list(user, query) {
    const filters = normalizeListQuery('tours', query);
    const result = await adminMaintenanceQueries.list('tours', {
      ...filters,
      ownerId: ownerScope(user),
    });
    return {
      data: { items: result.rows },
      meta: {
        page: filters.page,
        limit: filters.limit,
        total: result.total,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / filters.limit),
      },
    };
  }

  async getById(user, id) {
    const entity = await adminMaintenanceQueries.getById('tours', Number(id));
    assertOwned(entity, user);
    return { entity };
  }

  async create(user, data) {
    return adminMaintenanceService.create('tours', data, { authUser: user });
  }

  async update(user, id, data) {
    const current = await adminMaintenanceQueries.getById('tours', Number(id));
    assertOwned(current, user);
    return adminMaintenanceService.update('tours', Number(id), data);
  }

  async getReferences() {
    const [countries, zones, nodes] = await Promise.all([
      adminMaintenanceQueries.list('countries', { search: '', limit: 100, offset: 0 }),
      adminMaintenanceQueries.list('zones', { search: '', limit: 100, offset: 0 }),
      adminMaintenanceQueries.list('nodes', { search: '', limit: 100, offset: 0 }),
    ]);
    return {
      countries: countries.rows,
      zones: zones.rows,
      nodes: nodes.rows,
    };
  }
}

export { assertOwned, ownerScope };
export default new MyToursService();
