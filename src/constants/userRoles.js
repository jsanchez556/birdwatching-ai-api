export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  CUSTOMER: 'customer',
  GUIDE: 'tour guide',
});

export const USER_ROLE_VALUES = Object.freeze(Object.values(USER_ROLES));
export const TOUR_MANAGER_ROLES = Object.freeze([USER_ROLES.ADMIN, USER_ROLES.GUIDE]);

export function normalizeUserRole(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return USER_ROLE_VALUES.includes(normalized) ? normalized : null;
}

export function canManageTours(role) {
  return TOUR_MANAGER_ROLES.includes(normalizeUserRole(role));
}
