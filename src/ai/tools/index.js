import { tourToolHandlers } from './tour-tools.js';
import { tourSchema } from '../schemas/tour.schema.js';
import logger from '../../utils/logger.js';

const TOOL_EXECUTION_FAILED_MESSAGE = 'I could not complete that action right now. Please try again in a moment.';

const toolGroups = [
  {
    name: 'tour',
    schemas: tourSchema,
    handlers: tourToolHandlers,
  },
];

function getToolName(schema) {
  return schema?.function?.name;
}

function createToolRegistry(groups) {
  const schemas = [];
  const handlers = new Map();

  for (const group of groups) {
    if (!Array.isArray(group.schemas)) {
      throw new Error(`Tool group ${group.name} must provide a schemas array`);
    }

    for (const schema of group.schemas) {
      const toolName = getToolName(schema);

      if (!toolName) {
        throw new Error(`Tool group ${group.name} includes a schema without function.name`);
      }

      if (handlers.has(toolName)) {
        throw new Error(`Duplicate tool registered: ${toolName}`);
      }

      const handler = group.handlers?.[toolName];

      if (typeof handler !== 'function') {
        throw new Error(`Tool ${toolName} is missing a handler`);
      }

      schemas.push(schema);
      handlers.set(toolName, handler);
    }
  }

  return {
    schemas,
    handlers,
  };
}

const registry = createToolRegistry(toolGroups);

export const availableTools = registry.schemas;

export function getToolSchemas() {
  return availableTools;
}

export function hasTool(name) {
  return registry.handlers.has(name);
}

export function formatToolExecutionFailure() {
  return {
    success: false,
    code: 'TOOL_EXECUTION_FAILED',
    message: TOOL_EXECUTION_FAILED_MESSAGE,
  };
}

export async function executeToolCall(name, args = {}, metadata = {}) {
  const handler = registry.handlers.get(name);

  if (!handler) {
    logger.warn('Unknown tool requested', {
      toolName: name,
      conversationId: metadata.conversationId,
    });

    return {
      success: false,
      code: 'UNKNOWN_TOOL',
      message: `Tool ${name} is not available.`,
    };
  }

  try {
    const result = await handler(args, metadata);
    logger.info('Tool call completed', {
      toolName: name,
      success: result?.success !== false,
      conversationId: metadata.conversationId,
    });
    return result;
  } catch (error) {
    logger.warn('Tool call failed', {
      toolName: name,
      error: error.message,
      conversationId: metadata.conversationId,
    });

    return formatToolExecutionFailure();
  }
}

export { createToolRegistry, tourSchema, TOOL_EXECUTION_FAILED_MESSAGE };
