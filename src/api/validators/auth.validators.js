const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 120;
const MIN_REFRESH_TOKEN_LENGTH = 32;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function normalizeName(value, errors) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    errors.push('Name must be text when provided');
    return undefined;
  }

  const name = value.trim();
  if (name.length > MAX_NAME_LENGTH) {
    errors.push(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }

  return name || undefined;
}

function validateEmail(email, errors) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    errors.push('Email is required');
    return undefined;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    errors.push('Email must be a valid email address');
  }

  return normalizedEmail;
}

function validatePassword(password, errors) {
  if (!password || typeof password !== 'string') {
    errors.push('Password is required');
    return password;
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`);
  }

  return password;
}

export function validateSignupBody(req) {
  const errors = [];
  const { email, password, name } = req.body;
  const normalizedEmail = validateEmail(email, errors);
  const normalizedPassword = validatePassword(password, errors);
  const normalizedName = normalizeName(name, errors);

  return {
    message: 'Invalid signup payload',
    errors,
    value: {
      email: normalizedEmail,
      password: normalizedPassword,
      name: normalizedName,
    },
  };
}

export function validateLoginBody(req) {
  const errors = [];
  const { email, password } = req.body;
  const normalizedEmail = validateEmail(email, errors);
  const normalizedPassword = validatePassword(password, errors);

  return {
    message: 'Invalid login payload',
    errors,
    value: {
      email: normalizedEmail,
      password: normalizedPassword,
    },
  };
}

function validateRefreshToken(refreshToken, errors) {
  if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length < MIN_REFRESH_TOKEN_LENGTH) {
    errors.push('Refresh token is required');
    return undefined;
  }

  return refreshToken;
}

export function validateRefreshBody(req) {
  const errors = [];
  const refreshToken = validateRefreshToken(req.body.refreshToken, errors);

  return {
    message: 'Invalid refresh payload',
    errors,
    value: {
      refreshToken,
    },
  };
}

export function validateLogoutBody(req) {
  const errors = [];
  const refreshToken = req.body.refreshToken === undefined
    ? undefined
    : validateRefreshToken(req.body.refreshToken, errors);

  return {
    message: 'Invalid logout payload',
    errors,
    value: {
      refreshToken,
    },
  };
}
