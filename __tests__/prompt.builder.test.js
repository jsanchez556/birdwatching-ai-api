import {
  buildPrompt,
  buildChatMessages,
  injectRagContextMessage,
  injectResponseModeMessage,
} from '../src/ai/prompts/prompt.builder.js';
import {
  CHAT_SYSTEM_PROMPT,
} from '../src/ai/prompts/system.prompt.js';

describe('prompt builder', () => {
  it('builds a generic prompt from system, RAG, memory, and user context', () => {
    expect(buildPrompt({
      systemPrompt: 'Base system prompt',
      ragContext: 'Retrieved Costa Rica bird knowledge',
      memoryContext: [
        { role: 'user', content: 'I am visiting Monteverde.' },
        { role: 'assistant', content: 'Monteverde is excellent for cloud forest species.' },
      ],
      userMessage: 'Where should I visit first?',
    })).toEqual([
      { role: 'system', content: 'Base system prompt' },
      { role: 'system', content: 'Retrieved Costa Rica bird knowledge' },
      { role: 'user', content: 'I am visiting Monteverde.' },
      { role: 'assistant', content: 'Monteverde is excellent for cloud forest species.' },
      { role: 'user', content: 'Where should I visit first?' },
    ]);
  });

  it('formats retrieved documents when generic RAG context receives document records', () => {
    expect(buildPrompt({
      systemPrompt: 'Base system prompt',
      ragContext: [
        {
          name: 'Resplendent Quetzal',
          locations: 'Monteverde',
          description: 'Cloud forest bird.',
          score: 0.98765,
        },
      ],
      userMessage: 'Where can I see quetzals?',
    })).toEqual([
      { role: 'system', content: 'Base system prompt' },
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('Resplendent Quetzal'),
      }),
      { role: 'user', content: 'Where can I see quetzals?' },
    ]);
  });

  it('builds chat messages from the versioned system prompt, history, and current user message', () => {
    expect(buildChatMessages({
      history: [
        { role: 'user', content: 'I am visiting Monteverde.' },
        { role: 'assistant', content: 'Monteverde is excellent for cloud forest species.' },
      ],
      userMessage: 'Where should I visit first?',
    })).toEqual([
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      { role: 'user', content: 'I am visiting Monteverde.' },
      { role: 'assistant', content: 'Monteverde is excellent for cloud forest species.' },
      { role: 'user', content: 'Where should I visit first?' },
    ]);
  });

  it('injects RAG context after the base system prompt', () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Where can I see quetzals?' },
    ];

    expect(injectRagContextMessage(messages, [
      {
        name: 'Resplendent Quetzal',
        locations: 'Monteverde',
        description: 'Cloud forest bird.',
        score: 0.98765,
      },
    ])).toEqual([
      { role: 'system', content: 'Base prompt' },
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('Resplendent Quetzal'),
      }),
      { role: 'user', content: 'Where can I see quetzals?' },
    ]);
  });

  it('injects field assistant mode after the base system prompt', () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'What am I hearing?' },
    ];

    expect(injectResponseModeMessage(messages, 'field_assistant')).toEqual([
      { role: 'system', content: 'Base prompt' },
      {
        role: 'system',
        content: expect.stringContaining('Field assistant mode'),
      },
      { role: 'user', content: 'What am I hearing?' },
    ]);
  });

});
