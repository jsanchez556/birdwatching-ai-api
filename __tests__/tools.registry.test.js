import { jest } from '@jest/globals';

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const {
  availableTools,
  createToolRegistry,
  executeToolCall,
  formatToolExecutionFailure,
  getToolSchemas,
  hasTool,
  TOOL_EXECUTION_FAILED_MESSAGE,
} = await import('../src/ai/tools/index.js');

describe('tool registry', () => {
  it('exposes registered schemas and handlers by tool name', () => {
    expect(getToolSchemas()).toBe(availableTools);
    expect(availableTools.map((tool) => tool.function.name)).toEqual([
      'searchTours',
      'calculateTransfer',
      'checkAvailability',
      'calculatePricing',
      'createReservation',
    ]);
    expect(hasTool('checkAvailability')).toBe(true);
    expect(hasTool('missingTool')).toBe(false);
  });

  it('can build a registry from a future tool group', async () => {
    const registry = createToolRegistry([
      {
        name: 'future',
        schemas: [
          {
            type: 'function',
            function: {
              name: 'futureTool',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        handlers: {
          futureTool: jest.fn(),
        },
      },
    ]);

    expect(registry.schemas).toHaveLength(1);
    expect(registry.handlers.has('futureTool')).toBe(true);
  });

  it('rejects duplicate tool names', () => {
    const duplicateGroup = {
      name: 'duplicate',
      schemas: [
        { type: 'function', function: { name: 'sameTool' } },
        { type: 'function', function: { name: 'sameTool' } },
      ],
      handlers: {
        sameTool: jest.fn(),
      },
    };

    expect(() => createToolRegistry([duplicateGroup])).toThrow('Duplicate tool registered');
  });

  it('rejects schemas without matching handlers', () => {
    expect(() => createToolRegistry([
      {
        name: 'broken',
        schemas: [{ type: 'function', function: { name: 'missingHandler' } }],
        handlers: {},
      },
    ])).toThrow('Tool missingHandler is missing a handler');
  });

  it('returns a structured error for unknown tool execution', async () => {
    await expect(executeToolCall('missingTool')).resolves.toEqual({
      success: false,
      code: 'UNKNOWN_TOOL',
      message: 'Tool missingTool is not available.',
    });
  });

  it('formats tool execution failures without raw technical details', () => {
    expect(formatToolExecutionFailure()).toEqual({
      success: false,
      code: 'TOOL_EXECUTION_FAILED',
      message: TOOL_EXECUTION_FAILED_MESSAGE,
    });
    expect(formatToolExecutionFailure().message).not.toContain('customer_email');
    expect(formatToolExecutionFailure().message).not.toContain('reservations');
  });
});
