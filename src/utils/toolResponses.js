function invalidArguments(error) {
  return {
    success: false,
    code: 'INVALID_TOOL_ARGUMENTS',
    message: error.message,
  };
}

function toPositiveInteger(value, fieldName, fallback = null, { allowEmptyFallback = false } = {}) {
  if (value === undefined || value === null || (allowEmptyFallback && value === '')) {
    if (fallback !== null) {
      return fallback;
    }
    throw new Error(`${fieldName} must be a positive integer`);
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return numberValue;
}

export {
  invalidArguments,
  toPositiveInteger,
};
