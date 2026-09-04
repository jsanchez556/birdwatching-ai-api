const PLACE_KEYS = new Set(['placeId']);

function unknownKeys(value, allowed, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key)).map((key) => `${prefix}${key} is not allowed`);
}

function positiveInteger(value, name, errors, { allowZero = false, max = 50 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < (allowZero ? 0 : 1) || number > max) {
    errors.push(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer no greater than ${max}`);
  }
  return number;
}

export function validateRouteQuote(req) {
  const errors = unknownKeys(req.body, new Set(['origin', 'destination']));
  for (const name of ['origin', 'destination']) {
    const place = req.body?.[name];
    if (!place || typeof place !== 'object' || Array.isArray(place)) errors.push(`${name} is required`);
    else {
      errors.push(...unknownKeys(place, PLACE_KEYS, `${name}.`));
      if (typeof place.placeId !== 'string' || !place.placeId.trim() || place.placeId.length > 256) errors.push(`${name}.placeId is required`);
    }
  }
  return { message: 'Invalid route quote payload', errors, value: {
    origin: { placeId: req.body?.origin?.placeId?.trim() },
    destination: { placeId: req.body?.destination?.placeId?.trim() },
  } };
}

export function validateVehicleQuery(req) {
  const errors = unknownKeys(req.query, new Set(['routeToken', 'passengers', 'luggage']));
  if (typeof req.query.routeToken !== 'string' || !req.query.routeToken) errors.push('routeToken is required');
  const passengers = positiveInteger(req.query.passengers, 'passengers', errors, { max: 50 });
  const luggage = positiveInteger(req.query.luggage, 'luggage', errors, { allowZero: true, max: 100 });
  return { message: 'Invalid vehicle query', errors, value: { routeToken: req.query.routeToken, passengers, luggage } };
}

export function validateTransportBooking(req) {
  const allowed = new Set(['routeToken', 'quoteToken', 'pickupAt', 'passengers', 'luggage', 'contact', 'comments', 'paymentMethod', 'idempotencyKey']);
  const errors = unknownKeys(req.body, allowed);
  const contact = req.body?.contact;
  const contactAllowed = new Set(['firstName', 'lastName', 'email', 'phone']);
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) errors.push('contact is required');
  else errors.push(...unknownKeys(contact, contactAllowed, 'contact.'));
  const cleanedContact = {};
  for (const field of ['firstName', 'lastName', 'email', 'phone']) {
    cleanedContact[field] = typeof contact?.[field] === 'string' ? contact[field].trim() : '';
    if (!cleanedContact[field]) errors.push(`contact.${field} is required`);
  }
  if (cleanedContact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedContact.email)) errors.push('contact.email is invalid');
  if (cleanedContact.phone && !/^\+[1-9]\d{7,14}$/.test(cleanedContact.phone.replace(/[\s()-]/g, ''))) errors.push('contact.phone must be an international phone number');
  if (typeof req.body.routeToken !== 'string' || !req.body.routeToken) errors.push('routeToken is required');
  if (typeof req.body.quoteToken !== 'string' || !req.body.quoteToken) errors.push('quoteToken is required');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(req.body.pickupAt || '')) errors.push('pickupAt must be an ISO-8601 timestamp with an offset');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.body.idempotencyKey || '')) errors.push('idempotencyKey must be a UUID');
  const passengers = positiveInteger(req.body.passengers, 'passengers', errors, { max: 50 });
  const luggage = positiveInteger(req.body.luggage, 'luggage', errors, { allowZero: true, max: 100 });
  const comments = typeof req.body.comments === 'string' ? req.body.comments.trim() : '';
  if (comments.length > 1000) errors.push('comments must not exceed 1000 characters');
  const paymentMethod = req.body.paymentMethod;
  if (!paymentMethod || typeof paymentMethod !== 'object' || paymentMethod.type !== 'pay_on_arrival') errors.push('paymentMethod.type must be pay_on_arrival');
  else errors.push(...unknownKeys(paymentMethod, new Set(['type', 'reference']), 'paymentMethod.'));
  return { message: 'Invalid transportation booking payload', errors, value: {
    routeToken: req.body.routeToken, quoteToken: req.body.quoteToken, pickupAt: req.body.pickupAt,
    passengers, luggage, contact: cleanedContact, comments,
    paymentMethod: { type: 'pay_on_arrival', reference: null }, idempotencyKey: req.body.idempotencyKey,
  } };
}
