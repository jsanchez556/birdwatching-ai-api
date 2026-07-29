/**
 * Validates the orchestration-level argument envelope. Tool-specific schemas
 * and business validation remain owned by each registered tool adapter.
 */
export function validateToolArguments(args) {
  if (args === undefined || args === null) return {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    return {
      valid: false,
      code: 'INVALID_TOOL_ARGUMENTS',
      message: 'Tool arguments must be an object.',
    };
  }
  return { valid: true, args };
}
