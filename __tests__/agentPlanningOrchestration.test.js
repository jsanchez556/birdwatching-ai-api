import { jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: mockLogger,
}));

const { ToolPlanner } = await import('../src/ai/planners/tool.planner.js');
const { ToolExecutor } = await import('../src/ai/tools/tool.executor.js');
const { calculateTransportation } = await import('../src/ai/tools/transportation.tool.js');
const { AgentOrchestrator } = await import('../src/ai/orchestrators/agent.orchestrator.js');
const { validateChatBody } = await import('../src/api/validators/chat.validator.js');

function createValidIntentExtractor(intent = 'create_reservation') {
  return {
    extract: jest.fn().mockResolvedValue({
      success: true,
      data: {
        intent,
        tourId: null,
        location: null,
        date: null,
        participants: null,
        transportationRequired: null,
        pickupLocation: null,
        missingFields: [],
        confidence: 1,
      },
    }),
  };
}

describe('multi-tool agent planning and orchestration', () => {
  it('plans a single tour search tool for discovery requests', () => {
    const planner = new ToolPlanner();

    expect(planner.plan({
      message: 'Recommend easy Monteverde tours for 2 people',
    })).toMatchObject({
      status: 'ready',
      steps: [
        {
          tool: 'searchTours',
          args: {
            location: 'Monteverde',
            difficulty: 'easy',
            participants: 2,
            recommend: true,
          },
        },
      ],
    });
  });

  it('plans sequential transportation and pricing tools for full cost requests', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'What is the full cost with shuttle for tour 7 for 4 people?',
    });

    expect(plan.status).toBe('ready');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'calculateTransportation',
      'calculatePricing',
    ]);
    expect(plan.steps[1].args).toMatchObject({
      tourId: 7,
      participants: 4,
    });
  });

  it('plans tour search plus transportation when a tour request includes transportation', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'I want a birdwatching tour in Monteverde for 3 people with transportation from San Jose.',
    });

    expect(plan.status).toBe('ready');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'searchTours',
      'calculateTransportation',
    ]);
    expect(plan.steps[0].args).toMatchObject({
      location: 'Monteverde',
      participants: 3,
      recommend: true,
    });
    expect(plan.steps[1].args).toMatchObject({
      location: 'Monteverde',
      participants: 3,
    });
  });

  it('uses Bijagua as the tour location instead of the San Jose pickup origin', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'I want a birdwatching tour in bijagua of upala for 3 people with transportation from San Jose.',
    });

    expect(plan.status).toBe('ready');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'searchTours',
      'calculateTransportation',
    ]);
    expect(plan.steps[0].args).toMatchObject({
      location: 'Tenorio-Bijagua and Rio Celeste',
      participants: 3,
      recommend: true,
    });
    expect(plan.steps[1].args).toMatchObject({
      location: 'Tenorio-Bijagua and Rio Celeste',
      participants: 3,
    });
  });

  it('calculates transportation options for Tenorio-Bijagua tours', async () => {
    await expect(calculateTransportation({
      location: 'Tenorio-Bijagua and Río Celeste / Tapir Valley Nature Reserve',
      participants: 3,
      origin: 'San Jose',
    })).resolves.toMatchObject({
      success: true,
      origin: 'San Jose',
      destination: 'Tenorio-Bijagua and Rio Celeste',
      options: [
        expect.objectContaining({
          type: 'shared_shuttle',
          pricePerPerson: 75,
          totalPrice: 225,
        }),
        expect.objectContaining({
          type: 'private_transfer',
          totalPrice: 260,
        }),
      ],
    });
  });

  it('shows transportation options after a tour is selected when transportation was requested earlier', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'I choose tour 1: Tapir Valley Birding Tour',
      context: {
        recentTours: [
          {
            tourId: 1,
            name: 'Tapir Valley Birding Tour',
            location: 'Tenorio-Bijagua and Río Celeste / Tapir Valley Nature Reserve',
            availableSlots: 8,
          },
          {
            tourId: 2,
            name: 'Heliconias Hanging Bridges Birding Tour',
            location: 'Tenorio-Bijagua and Río Celeste / Heliconias Rainforest Lodge and Hanging Bridges',
            availableSlots: 10,
          },
        ],
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-06-03',
          itineraryEndDate: '2026-06-03',
        },
        messages: [
          {
            role: 'user',
            content: 'I want a birdwatching tour in bijagua of upala for 3 people with transportation from San Jose.',
          },
          {
            role: 'assistant',
            content: 'I found 2 tours that match your preferences.',
          },
          {
            role: 'user',
            content: 'I choose tour 1: Tapir Valley Birding Tour',
          },
        ],
      },
    });

    expect(plan.status).toBe('transportation_requested');
    expect(plan.requestedTransportation).toBe(true);
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculateTransportation',
    ]);
    expect(plan.steps.map((step) => step.tool)).not.toContain('calculatePricing');
    expect(plan.steps.map((step) => step.tool)).not.toContain('createReservation');
    expect(plan.steps[0].args).toMatchObject({
      tourId: 1,
      tourName: 'Tapir Valley Birding Tour',
      location: 'Tenorio-Bijagua and Río Celeste / Tapir Valley Nature Reserve',
      participants: 3,
    });
  });

  it('plans transportation before reservation confirmation for combined transportation reservation intent', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'I need transportation and a reservation for tour 1 for 3 people',
      context: {
        customerContext: {
          customerName: 'Ana Gomez',
          customerEmail: 'ana@example.com',
          itineraryStartDate: '2026-06-12',
          itineraryEndDate: '2026-06-15',
        },
      },
    });

    expect(plan.status).toBe('needs_clarification');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'calculateTransportation',
      'checkAvailability',
    ]);
    expect(plan.steps.map((step) => step.tool)).not.toContain('createReservation');
  });

  it('plans search before transportation when combined reservation intent has no selected tour', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'I need transportation and a reservation',
    });

    expect(plan.status).toBe('needs_clarification');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'searchTours',
      'calculateTransportation',
    ]);
    expect(plan.steps[0].args).toMatchObject({
      recommend: true,
      limit: 3,
    });
  });

  it('shows details for the previously found single tour without searching alternatives', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'Show me details',
      context: {
        recentTours: [
          {
            tourId: 1,
            name: 'Monteverde Quetzal Tour',
            location: 'Monteverde',
            availableSlots: 5,
          },
        ],
        recentToolsCalled: ['searchTours', 'calculateTransportation'],
        messages: [
          {
            role: 'user',
            content: 'I want a birdwatching tour in Monteverde for 3 people with transportation from San Jose.',
          },
          {
            role: 'assistant',
            content: 'I found 1 tour that matches your preferences. Would you like more details about this tour?',
          },
          {
            role: 'user',
            content: 'yes',
          },
        ],
      },
    });

    expect(plan.status).toBe('show_details');
    expect(plan.message).toContain('Monteverde Quetzal Tour');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculateTransportation',
    ]);
    expect(plan.steps[0].args).toMatchObject({
      tourId: 1,
      tourName: 'Monteverde Quetzal Tour',
      participants: 3,
    });
  });

  it('uses the previous single tour when proceeding with booking', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'Proceed with booking',
      context: {
        recentTours: [
          {
            tourId: 1,
            name: 'Monteverde Quetzal Tour',
            location: 'Monteverde',
            availableSlots: 5,
          },
        ],
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-23',
          itineraryEndDate: '2026-05-26',
        },
        messages: [
          {
            role: 'user',
            content: 'I want a birdwatching tour in Monteverde for 3 people with transportation from San Jose.',
          },
          {
            role: 'assistant',
            content: 'I found 1 tour that matches your preferences. Would you like more details?',
          },
          { role: 'user', content: 'Proceed with booking' },
        ],
      },
    });

    expect(plan.status).toBe('transportation_requested');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculateTransportation',
    ]);
    expect(plan.steps[0].args).toMatchObject({
      tourId: 1,
      participants: 3,
      customerName: 'Jose Sanchez',
      customerEmail: 'jose@example.com',
    });
    expect(plan.steps.map((step) => step.tool)).not.toContain('createReservation');
  });

  it('persists transportation selection without recalculating transportation', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'I choose shared shuttle from San Jose to Monteverde',
      context: {
        recentMetadata: {
          uiAction: {
            type: 'transportation_selection',
            options: [
              {
                label: 'Shared shuttle',
                value: {
                  transportationOption: 'shared_shuttle',
                  origin: 'San Jose',
                  destination: 'Monteverde',
                },
              },
              {
                label: 'Private transfer',
                value: {
                  transportationOption: 'private_transfer',
                  origin: 'San Jose',
                  destination: 'Monteverde',
                },
              },
            ],
          },
        },
        recentTours: [
          {
            tourId: 1,
            name: 'Monteverde Quetzal Tour',
            location: 'Monteverde',
            availableSlots: 5,
          },
        ],
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-23',
          itineraryEndDate: '2026-05-26',
        },
        messages: [
          {
            role: 'user',
            content: 'I want a birdwatching tour in Monteverde for 3 people with transportation from San Jose.',
          },
          {
            role: 'assistant',
            content: 'Which transportation option would you prefer?',
          },
          {
            role: 'user',
            content: 'I choose shared shuttle from San Jose to Monteverde',
          },
        ],
      },
    });

    expect(plan.status).toBe('transportation_selected');
    expect(plan.selectedTransportation).toMatchObject({
      transportationOption: 'shared_shuttle',
      label: 'Shared shuttle',
      origin: 'San Jose',
      destination: 'Monteverde',
    });
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculatePricing',
    ]);
    expect(plan.steps.map((step) => step.tool)).not.toContain('calculateTransportation');
    expect(plan.steps[0].args).toMatchObject({
      tourId: 1,
      participants: 3,
      customerName: 'Jose Sanchez',
      customerEmail: 'jose@example.com',
    });
  });

  it('carries participant count from recent metadata after transportation selection', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'I choose shared shuttle from San Jose to Sarapiqui',
      context: {
        recentMetadata: {
          participants: 2,
          selectedTourId: 2,
          selectedTour: {
            tourId: 2,
            name: 'Sarapiqui Rainforest Tour',
            location: 'Sarapiqui',
          },
          uiAction: {
            type: 'transportation_selection',
            options: [
              {
                label: 'Shared shuttle',
                value: {
                  transportationOption: 'shared_shuttle',
                  origin: 'San Jose',
                  destination: 'Sarapiqui',
                  totalPrice: 110,
                },
              },
            ],
          },
        },
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-17',
          itineraryEndDate: '2026-05-17',
        },
        messages: [
          { role: 'user', content: '2' },
          { role: 'assistant', content: 'Which transportation option would you prefer?' },
          { role: 'user', content: 'I choose shared shuttle from San Jose to Sarapiqui' },
        ],
      },
    });

    expect(plan.status).toBe('transportation_selected');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculatePricing',
    ]);
    expect(plan.steps[0].args).toMatchObject({
      tourId: 2,
      tourName: 'Sarapiqui Rainforest Tour',
      location: 'Sarapiqui',
      participants: 2,
    });
  });

  it('preserves booking metadata from the frontend conversation context validator', () => {
    const result = validateChatBody({
      body: {
        message: 'I choose private transfer from San Jose to Monteverde',
        conversationContext: {
          recentAssistantMetadata: {
            selectedTourId: 1,
            selectedTour: {
              tourId: 1,
              name: 'Monteverde Quetzal Tour',
              location: 'Monteverde',
              pricePerPerson: 120,
              availableSlots: 10,
              durationHours: 4,
              difficulty: 'moderate',
            },
            participants: 3,
            selectedTransportation: {
              transportationOption: 'private_transfer',
              origin: 'San Jose',
              destination: 'Monteverde',
              label: 'Private transfer',
              totalPrice: 220,
              currency: 'USD',
            },
            requestedTransportation: true,
            transportationDeclined: true,
            uiAction: {
              type: 'transportation_selection',
              options: [],
            },
          },
        },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.value.conversationContext.recentAssistantMetadata).toMatchObject({
      selectedTourId: 1,
      selectedTour: {
        tourId: 1,
        name: 'Monteverde Quetzal Tour',
      },
      participants: 3,
      selectedTransportation: {
        transportationOption: 'private_transfer',
        totalPrice: 220,
      },
      requestedTransportation: true,
      transportationDeclined: true,
    });
  });

  it('preserves reservation-entry metadata from homepage and cart chat entry points', () => {
    const result = validateChatBody({
      body: {
        message: 'I would like to reserve my cart tours.',
        conversationContext: {
          recentAssistantMetadata: {
            conversationType: 'reservation_entry',
            conversationSource: 'tour_cart',
            reservationEntry: {
              source: 'tour_cart',
              cart: {
                itineraryStartDate: '2026-07-10',
                itineraryEndDate: '2026-07-12',
                count: 2,
              },
              tours: [
                {
                  tourId: 1,
                  name: 'Monteverde Quetzal Tour',
                  location: 'Monteverde',
                  pricePerPerson: 120,
                  scheduledDate: '2026-07-10',
                  participants: 2,
                  needsTransportation: true,
                },
                {
                  tourId: 2,
                  name: 'Sarapiqui Rainforest Tour',
                  location: 'Sarapiqui',
                  pricePerPerson: 140,
                  scheduledDate: '2026-07-11',
                },
              ],
            },
          },
        },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.value.conversationContext.recentAssistantMetadata).toMatchObject({
      conversationType: 'reservation_entry',
      conversationSource: 'tour_cart',
      entrySource: 'tour_cart',
      reservationEntry: {
        source: 'tour_cart',
        cart: {
          itineraryStartDate: '2026-07-10',
          itineraryEndDate: '2026-07-12',
          count: 2,
        },
        tours: [
          {
            tourId: 1,
            name: 'Monteverde Quetzal Tour',
            scheduledDate: '2026-07-10',
            participants: 2,
            needsTransportation: true,
          },
          {
            tourId: 2,
            name: 'Sarapiqui Rainforest Tour',
            scheduledDate: '2026-07-11',
          },
        ],
      },
    });
  });

  it('selects an explicit guided tour choice without using the generic search action', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'I choose tour 2: Sarapiqui Rainforest Tour',
      context: {
        recentTours: [
          {
            tourId: 2,
            name: 'Sarapiqui Rainforest Tour',
            location: 'Sarapiqui',
            availableSlots: 3,
          },
        ],
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-23',
          itineraryEndDate: '2026-05-26',
        },
      },
    });

    expect(plan.status).toBe('select_tour');
    expect(plan.steps).toEqual([
      expect.objectContaining({
        tool: 'checkAvailability',
        args: expect.objectContaining({
          tourId: 2,
          tourName: 'Sarapiqui Rainforest Tour',
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
        }),
      }),
    ]);
  });

  it('selects a recent tour by typed tour name without searching alternatives', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'I choose Sarapiqui Rainforest Tour',
      context: {
        recentTours: [
          {
            tourId: 2,
            name: 'Sarapiqui Rainforest Tour',
            location: 'Sarapiqui',
            availableSlots: 3,
          },
          {
            tourId: 9,
            name: 'Palo Verde Wetlands Birding',
            location: 'Palo Verde National Park',
            availableSlots: 8,
          },
        ],
      },
    });

    expect(plan.status).toBe('select_tour');
    expect(plan.steps).toEqual([
      expect.objectContaining({
        tool: 'checkAvailability',
        args: expect.objectContaining({
          tourId: 2,
          tourName: 'Sarapiqui Rainforest Tour',
          location: 'Sarapiqui',
        }),
      }),
    ]);
    expect(plan.steps.map((step) => step.tool)).not.toContain('searchTours');
  });

  it('asks for missing details before pricing', () => {
    const planner = new ToolPlanner();

    expect(planner.plan({
      message: 'How much does tour 3 cost?',
    })).toEqual({
      status: 'needs_clarification',
      message: 'How many people should I price the tour for?',
      steps: [],
    });
  });

  it('asks for a tour before pricing when participant count is present but no tour is selected', () => {
    const planner = new ToolPlanner();

    expect(planner.plan({
      message: 'How much does it cost for 2 people?',
    })).toEqual({
      status: 'needs_clarification',
      message: 'Ask which tour they want pricing for before calculating a price.',
      steps: [],
    });
  });

  it('asks for a tour before checking availability without a selector', () => {
    const planner = new ToolPlanner();

    expect(planner.plan({
      message: 'Is there space for 2 people?',
    })).toEqual({
      status: 'needs_clarification',
      message: 'Ask which tour they want to check availability for.',
      steps: [],
    });
  });

  it('asks for a destination before calculating standalone transportation', () => {
    const planner = new ToolPlanner();

    expect(planner.plan({
      message: 'Can you calculate transportation for 2 people?',
    })).toEqual({
      status: 'needs_clarification',
      message: 'Ask which tour or destination they need transportation for before calculating transportation.',
      steps: [],
    });
  });

  it('does not calculate full cost without a selected tour or destination', () => {
    const planner = new ToolPlanner();

    expect(planner.plan({
      message: 'What is the full cost with shuttle for 2 people?',
    })).toEqual({
      status: 'needs_clarification',
      message: 'Ask which tour or destination they want a full cost for before calculating transportation and pricing.',
      steps: [],
    });
  });

  it('guards reservation creation until the user explicitly confirms', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'Book tour 3 for 2 people for Ana Gomez',
    });

    expect(plan.status).toBe('needs_confirmation');
    expect(plan.steps.map((step) => step.tool)).not.toContain('createReservation');
  });

  it('asks for transportation preference before confirmed booking when it is unknown', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'Please book tour 3 for 2 people and confirm the reservation',
      context: {
        customerContext: {
          customerName: 'Ana Gomez',
          customerEmail: 'ana@example.com',
          itineraryStartDate: '2026-06-12',
          itineraryEndDate: '2026-06-15',
        },
      },
    });

    expect(plan.status).toBe('needs_transportation_preference');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculatePricing',
    ]);
    expect(plan.steps.map((step) => step.tool)).not.toContain('createReservation');
    expect(plan.steps[1].args).toMatchObject({
      tourId: 3,
      participants: 2,
      customerName: 'Ana Gomez',
      customerEmail: 'ana@example.com',
    });
  });

  it('uses customer context and asks about transportation when confirming a guided booking without preference', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'Confirm reservation',
      context: {
        selectedTourId: 1,
        selectedTour: {
          tourId: 1,
          name: 'Monteverde Quetzal Tour',
          location: 'Monteverde',
        },
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-23',
          itineraryEndDate: '2026-05-26',
        },
        messages: [
          {
            role: 'user',
            content: 'I want a birdwatching tour in Monteverde for 3 people with transportation from San Jose.',
          },
          {
            role: 'assistant',
            content: 'Would you like to book this tour for 3 people?',
          },
          {
            role: 'user',
            content: 'Confirm reservation',
          },
        ],
      },
    });

    expect(plan.status).toBe('needs_transportation_preference');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculatePricing',
    ]);
    expect(plan.steps.map((step) => step.tool)).not.toContain('createReservation');
    expect(plan.steps[1].args).toMatchObject({
      tourId: 1,
      tourName: 'Monteverde Quetzal Tour',
      location: 'Monteverde',
      participants: 3,
      customerName: 'Jose Sanchez',
      customerEmail: 'jose@example.com',
    });
  });

  it('asks for transportation preference when the user selects participant count from the UI action', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: '3',
      context: {
        selectedTourId: 2,
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-17',
          itineraryEndDate: '2026-05-17',
        },
        recentMetadata: {
          selectedTourId: 2,
          selectedTour: {
            tourId: 2,
            name: 'Sarapiqui Rainforest Tour',
            location: 'Sarapiqui',
          },
          uiAction: {
            type: 'participant_count',
            min: 1,
            max: 3,
          },
        },
        messages: [
          { role: 'user', content: 'I choose tour 2: Sarapiqui Rainforest Tour' },
          { role: 'assistant', content: 'How many participants should I reserve?' },
          { role: 'user', content: '3' },
        ],
      },
    });

    expect(plan.status).toBe('needs_transportation_preference');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculatePricing',
    ]);
    expect(plan.steps.map((step) => step.tool)).not.toContain('createReservation');
    expect(plan.steps[1].args).toMatchObject({
      tourId: 2,
      participants: 3,
      customerName: 'Jose Sanchez',
      customerEmail: 'jose@example.com',
    });
  });

  it('calculates transportation when the user chooses to see transportation options', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'Show transportation',
      context: {
        selectedTourId: 2,
        selectedTour: {
          tourId: 2,
          name: 'Sarapiqui Rainforest Tour',
          location: 'Sarapiqui',
        },
        participants: 3,
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-17',
          itineraryEndDate: '2026-05-17',
        },
        messages: [
          { role: 'user', content: '3' },
          { role: 'assistant', content: 'Would you like transportation for this tour?' },
          { role: 'user', content: 'Show transportation' },
        ],
      },
    });

    expect(plan.status).toBe('transportation_requested');
    expect(plan.steps).toEqual([
      {
        tool: 'calculateTransportation',
        args: expect.objectContaining({
          tourId: 2,
          tourName: 'Sarapiqui Rainforest Tour',
          location: 'Sarapiqui',
          participants: 3,
        }),
        stopOnFailure: false,
      },
    ]);
  });

  it('marks transportation declined and prepares final confirmation', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'No, I have my own transportation',
      context: {
        selectedTourId: 2,
        selectedTour: {
          tourId: 2,
          name: 'Sarapiqui Rainforest Tour',
          location: 'Sarapiqui',
        },
        participants: 3,
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-17',
          itineraryEndDate: '2026-05-17',
        },
        messages: [
          { role: 'user', content: '3' },
          { role: 'assistant', content: 'Would you like transportation for this tour?' },
          { role: 'user', content: 'No, I have my own transportation' },
        ],
      },
    });

    expect(plan.status).toBe('transportation_declined');
    expect(plan.transportationDeclined).toBe(true);
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculatePricing',
    ]);
  });

  it('creates the reservation after final confirmation when transportation was declined', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'Confirm reservation',
      context: {
        selectedTourId: 2,
        selectedTour: {
          tourId: 2,
          name: 'Sarapiqui Rainforest Tour',
          location: 'Sarapiqui',
        },
        transportationDeclined: true,
        participants: 3,
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-17',
          itineraryEndDate: '2026-05-17',
        },
        messages: [
          { role: 'user', content: '3' },
          { role: 'user', content: 'No, I have my own transportation' },
          { role: 'user', content: 'Confirm reservation' },
        ],
      },
    });

    expect(plan.status).toBe('ready');
    expect(plan.transportationDeclined).toBe(true);
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculatePricing',
      'createReservation',
    ]);
  });

  it('treats yes as final confirmation when the prior action asks to confirm reservation', () => {
    const planner = new ToolPlanner();

    const plan = planner.plan({
      message: 'Yes',
      context: {
        recentMetadata: {
          participants: 2,
          selectedTourId: 2,
          selectedTour: {
            tourId: 2,
            name: 'Sarapiqui Rainforest Tour',
            location: 'Sarapiqui',
          },
          selectedTransportation: {
            transportationOption: 'shared_shuttle',
            origin: 'San Jose',
            destination: 'Sarapiqui',
            totalPrice: 110,
          },
          uiAction: {
            type: 'reservation_confirmation',
            prompt: 'Ready to confirm this reservation?',
            options: [
              { label: 'Confirm reservation', value: 'confirm_reservation' },
              { label: 'Cancel', value: 'cancel_reservation' },
            ],
          },
        },
        customerContext: {
          customerName: 'Jose Sanchez',
          customerEmail: 'jose@example.com',
          itineraryStartDate: '2026-05-17',
          itineraryEndDate: '2026-05-17',
        },
        messages: [
          { role: 'user', content: '2' },
          { role: 'user', content: 'I choose shared shuttle from San Jose to Sarapiqui' },
          { role: 'assistant', content: 'Ready to confirm this reservation?' },
          { role: 'user', content: 'Yes' },
        ],
      },
    });

    expect(plan.status).toBe('ready');
    expect(plan.steps.map((step) => step.tool)).toEqual([
      'checkAvailability',
      'calculatePricing',
      'createReservation',
    ]);
    expect(plan.steps[2].args).toMatchObject({
      tourId: 2,
      tourName: 'Sarapiqui Rainforest Tour',
      location: 'Sarapiqui',
      participants: 2,
      customerName: 'Jose Sanchez',
      customerEmail: 'jose@example.com',
    });
  });

  it('executes tools sequentially and captures safe tool failures', async () => {
    const handlers = {
      searchTours: jest.fn().mockResolvedValue({ success: true, tours: [] }),
      calculatePricing: jest.fn().mockRejectedValue(new Error('database exploded')),
    };
    const executor = new ToolExecutor(handlers);

    const results = await executor.executePlan({
      steps: [
        { tool: 'searchTours', args: { location: 'Monteverde' } },
        { tool: 'calculatePricing', args: { tourId: 1, participants: 2 } },
      ],
    }, {
      conversationId: 'conversation-123',
    });

    expect(handlers.searchTours).toHaveBeenCalledWith(
      { location: 'Monteverde' },
      expect.objectContaining({ conversationId: 'conversation-123' })
    );
    expect(handlers.calculatePricing).toHaveBeenCalled();
    expect(results).toEqual(expect.objectContaining({
      success: false,
      steps: [
        expect.objectContaining({
          tool: 'searchTours',
          result: { success: true, tours: [] },
        }),
        expect.objectContaining({
          tool: 'calculatePricing',
          result: expect.objectContaining({
            success: false,
            code: 'TOOL_EXECUTION_FAILED',
          }),
        }),
      ],
      errors: [
        expect.objectContaining({
          tool: 'calculatePricing',
          code: 'TOOL_EXECUTION_FAILED',
        }),
      ],
      finalOutput: expect.objectContaining({
        searchTours: { success: true, tours: [] },
        calculatePricing: expect.objectContaining({
          success: false,
          code: 'TOOL_EXECUTION_FAILED',
        }),
      }),
    }));
  });

  it('stores intermediate task results for later plan steps', async () => {
    const handlers = {
      searchTours: jest.fn().mockResolvedValue({
        success: true,
        tours: [{ tourId: 4, name: 'Cloud Forest Dawn Walk' }],
      }),
      checkAvailability: jest.fn().mockImplementation((args, metadata) => ({
        success: true,
        tourId: metadata.agentExecutionContext.results.discovery.tours[0].tourId,
        availableSlots: 5,
      })),
    };
    const executor = new ToolExecutor(handlers);
    const metadata = { conversationId: 'conversation-123' };

    const result = await executor.executePlan({
      steps: [
        { id: 'discovery', tool: 'searchTours', args: { location: 'Monteverde' } },
        { id: 'availability', tool: 'checkAvailability', args: { participants: 2 } },
      ],
    }, metadata);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      steps: [
        expect.objectContaining({ id: 'discovery', tool: 'searchTours' }),
        expect.objectContaining({
          id: 'availability',
          tool: 'checkAvailability',
          result: expect.objectContaining({ tourId: 4 }),
        }),
      ],
      results: expect.objectContaining({
        discovery: expect.objectContaining({
          tours: [expect.objectContaining({ tourId: 4 })],
        }),
        availability: expect.objectContaining({ tourId: 4 }),
      }),
      errors: [],
      finalOutput: expect.objectContaining({
        availability: expect.objectContaining({ availableSlots: 5 }),
      }),
    }));
    expect(metadata.agentExecutionContext).toBe(result);
    expect(Object.keys(metadata)).not.toContain('agentExecutionContext');
  });

  it('stores a sanitized debug trace with tool inputs, results, and intermediate state', async () => {
    const executor = new ToolExecutor({
      calculateTransportation: jest.fn().mockResolvedValue({
        success: true,
        origin: 'San Jose',
        destination: 'Monteverde',
        options: [
          {
            type: 'shared_shuttle',
            totalPrice: 120,
            currency: 'USD',
          },
        ],
        recommendedOption: 'shared_shuttle',
      }),
      createReservation: jest.fn().mockResolvedValue({
        success: true,
        reservationId: 22,
        customerName: 'Ana Gomez',
        customerEmail: 'ana@example.com',
      }),
    });
    const metadata = { conversationId: 'conversation-123' };

    const result = await executor.executePlan({
      status: 'ready',
      steps: [
        {
          id: 'transportation',
          tool: 'calculateTransportation',
          args: { location: 'Monteverde', participants: 2 },
        },
        {
          id: 'reservation',
          tool: 'createReservation',
          args: {
            tourId: 4,
            participants: 2,
            customerName: 'Ana Gomez',
            customerEmail: 'ana@example.com',
          },
        },
      ],
    }, metadata);

    expect(result.debugTrace).toEqual(expect.objectContaining({
      plan: expect.objectContaining({
        status: 'ready',
        tools: ['calculateTransportation', 'createReservation'],
      }),
      executions: [
        expect.objectContaining({
          id: 'transportation',
          tool: 'calculateTransportation',
          status: 'succeeded',
          input: { location: 'Monteverde', participants: 2 },
          intermediateState: expect.objectContaining({
            transportationCost: 120,
            recommendedTransportationOption: 'shared_shuttle',
          }),
        }),
        expect.objectContaining({
          id: 'reservation',
          tool: 'createReservation',
          status: 'succeeded',
          input: expect.objectContaining({
            customerName: '[redacted]',
            customerEmail: '[redacted]',
          }),
          result: expect.objectContaining({
            customerName: '[redacted]',
            customerEmail: '[redacted]',
          }),
          intermediateState: { reservationId: 22 },
        }),
      ],
      intermediateState: expect.objectContaining({
        transportation: expect.objectContaining({ transportationCost: 120 }),
        reservation: { reservationId: 22 },
      }),
      errors: [],
      skippedSteps: [],
    }));
    expect(metadata.agentDebugTrace).toBe(result.debugTrace);
    expect(Object.keys(metadata)).not.toContain('agentDebugTrace');
  });

  it('records skipped debug trace steps after a stop-on-failure tool error', async () => {
    const executor = new ToolExecutor({
      searchTours: jest.fn().mockResolvedValue({
        success: false,
        code: 'SEARCH_FAILED',
        message: 'Search failed.',
      }),
      calculateTransportation: jest.fn(),
    });
    const metadata = { conversationId: 'conversation-123' };

    const result = await executor.executePlan({
      status: 'ready',
      steps: [
        { id: 'search', tool: 'searchTours', args: { location: 'Monteverde' } },
        { id: 'transportation', tool: 'calculateTransportation', args: { location: 'Monteverde' } },
      ],
    }, metadata);

    expect(result.debugTrace.errors).toEqual([
      expect.objectContaining({
        id: 'search',
        tool: 'searchTours',
        code: 'SEARCH_FAILED',
      }),
    ]);
    expect(result.debugTrace.skippedSteps).toEqual([
      expect.objectContaining({
        id: 'transportation',
        tool: 'calculateTransportation',
        reason: expect.stringContaining('previous tool failed'),
      }),
    ]);
    expect(executor.handlers.get('calculateTransportation')).not.toHaveBeenCalled();
  });

  it('logs and traces each tool plan execution step', async () => {
    const log = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const executor = new ToolExecutor({
      searchTours: jest.fn().mockResolvedValue({ success: true, tours: [] }),
      calculatePricing: jest.fn().mockResolvedValue({ success: true, totalPrice: 240 }),
    }, { logger: log });
    const metadata = { conversationId: 'conversation-123' };

    const result = await executor.executePlan({
      status: 'ready',
      steps: [
        { id: 'search', tool: 'searchTours', args: { location: 'Monteverde' } },
        { id: 'pricing', tool: 'calculatePricing', args: { tourId: 1, participants: 2 } },
      ],
    }, metadata);

    expect(result.debugTrace.events).toEqual([
      expect.objectContaining({ event: 'tool_plan_started', stepCount: 2 }),
      expect.objectContaining({ event: 'tool_step_started', id: 'search', tool: 'searchTours' }),
      expect.objectContaining({ event: 'tool_step_completed', id: 'search', status: 'succeeded' }),
      expect.objectContaining({ event: 'tool_step_started', id: 'pricing', tool: 'calculatePricing' }),
      expect.objectContaining({ event: 'tool_step_completed', id: 'pricing', status: 'succeeded' }),
      expect.objectContaining({ event: 'tool_plan_completed', success: true, executedStepCount: 2 }),
    ]);
    expect(log.info).toHaveBeenCalledWith(
      'Agent tool plan execution started',
      expect.objectContaining({ conversationId: 'conversation-123', stepCount: 2 })
    );
    expect(log.info).toHaveBeenCalledWith(
      'Agent tool step started',
      expect.objectContaining({ conversationId: 'conversation-123', id: 'search', toolName: 'searchTours' })
    );
    expect(log.info).toHaveBeenCalledWith(
      'Agent tool step completed',
      expect.objectContaining({ conversationId: 'conversation-123', id: 'pricing', success: true })
    );
    expect(log.info).toHaveBeenCalledWith(
      'Agent tool plan execution completed',
      expect.objectContaining({ conversationId: 'conversation-123', success: true, executedStepCount: 2 })
    );
  });

  it('retries transient thrown tool failures and records each attempt', async () => {
    const transientError = Object.assign(new Error('temporary database outage'), {
      code: 'ETIMEDOUT',
    });
    const searchTours = jest.fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue({ success: true, tours: [] });
    const executor = new ToolExecutor({ searchTours }, {
      retry: { baseDelayMs: 0 },
    });

    const result = await executor.executePlan({
      status: 'ready',
      steps: [{ id: 'search', tool: 'searchTours', args: { location: 'Monteverde' } }],
    }, { conversationId: 'conversation-123' });

    expect(searchTours).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.debugTrace.executions[0]).toEqual(expect.objectContaining({
      id: 'search',
      status: 'succeeded',
      attempts: [
        expect.objectContaining({
          attempt: 1,
          status: 'failed',
          retryable: true,
          error: expect.objectContaining({ code: 'ETIMEDOUT' }),
        }),
        expect.objectContaining({
          attempt: 2,
          status: 'succeeded',
          retryable: false,
        }),
      ],
    }));
    expect(result.debugTrace.events).toContainEqual(expect.objectContaining({
      event: 'tool_retry_scheduled',
      tool: 'searchTours',
      attempt: 1,
      nextAttempt: 2,
      maxAttempts: 3,
      failure: expect.objectContaining({ code: 'ETIMEDOUT' }),
    }));
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'AI error monitored',
      expect.objectContaining({
        event: 'tool_timeout',
        toolName: 'searchTours',
        conversationId: 'conversation-123',
        attempt: 1,
        retryable: true,
        willRetry: true,
        failure: expect.objectContaining({ code: 'ETIMEDOUT' }),
      })
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Retrying agent tool call after retryable failure',
      expect.objectContaining({
        toolName: 'searchTours',
        attempt: 1,
        nextAttempt: 2,
        conversationId: 'conversation-123',
      })
    );
  });

  it('retries retryable tool result failures and preserves final fallback after exhaustion', async () => {
    const calculatePricing = jest.fn().mockResolvedValue({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Pricing is temporarily unavailable.',
    });
    const executor = new ToolExecutor({ calculatePricing }, {
      retry: {
        tools: {
          calculatePricing: { retries: 1, baseDelayMs: 0 },
        },
      },
    });

    const result = await executor.executePlan({
      status: 'ready',
      steps: [{ id: 'pricing', tool: 'calculatePricing', args: { tourId: 1, participants: 2 } }],
    }, { conversationId: 'conversation-123' });

    expect(calculatePricing).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(result.steps[0].result).toMatchObject({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Pricing is temporarily unavailable.',
    });
    expect(result.debugTrace.executions[0].attempts).toEqual([
      expect.objectContaining({ attempt: 1, status: 'failed', retryable: true }),
      expect.objectContaining({ attempt: 2, status: 'failed', retryable: true }),
    ]);
  });

  it('does not retry permanent user-correctable tool failures', async () => {
    const calculateTransportation = jest.fn().mockResolvedValue({
      success: false,
      code: 'TRANSPORTATION_LOCATION_REQUIRED',
      message: 'Please provide the tour location so I can estimate transportation.',
    });
    const executor = new ToolExecutor({ calculateTransportation }, {
      retry: { retries: 3, baseDelayMs: 0 },
    });

    const result = await executor.executePlan({
      status: 'ready',
      steps: [{ id: 'transportation', tool: 'calculateTransportation', args: { participants: 2 } }],
    }, { conversationId: 'conversation-123' });

    expect(calculateTransportation).toHaveBeenCalledTimes(1);
    expect(result.debugTrace.executions[0].attempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: 'failed',
        retryable: false,
        result: expect.objectContaining({ code: 'TRANSPORTATION_LOCATION_REQUIRED' }),
      }),
    ]);
  });

  it('allows execution steps to override retry behavior', async () => {
    const calculatePricing = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('first timeout'), { code: 'ETIMEDOUT' }))
      .mockRejectedValueOnce(Object.assign(new Error('second timeout'), { code: 'ETIMEDOUT' }))
      .mockResolvedValue({ success: true, totalPrice: 240 });
    const executor = new ToolExecutor({ calculatePricing }, {
      retry: { retries: 0, baseDelayMs: 0 },
    });

    const result = await executor.executePlan({
      status: 'ready',
      steps: [{
        id: 'pricing',
        tool: 'calculatePricing',
        args: { tourId: 1, participants: 2 },
        retry: { retries: 2, baseDelayMs: 0 },
      }],
    }, { conversationId: 'conversation-123' });

    expect(calculatePricing).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(true);
    expect(result.debugTrace.executions[0].attempts).toHaveLength(3);
  });

  it('never automatically retries createReservation even when retry overrides request it', async () => {
    const createReservation = jest.fn().mockRejectedValue(
      Object.assign(new Error('ambiguous database timeout'), {
        code: 'ETIMEDOUT',
        retryable: true,
      })
    );
    const executor = new ToolExecutor({ createReservation }, {
      retry: { retries: 5, baseDelayMs: 0 },
    });

    const result = await executor.executePlan({
      status: 'ready',
      steps: [{
        tool: 'createReservation',
        args: { tourId: 1, participants: 2 },
        retries: 5,
      }],
    }, { conversationId: 'conversation-123' });

    expect(createReservation).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.steps[0].result).toMatchObject({
      code: 'TOOL_RESULT_INDETERMINATE',
      retryable: false,
      message: expect.stringContaining('check its status'),
    });
    expect(result.debugTrace.executions[0].attempts).toHaveLength(1);
  });

  it('adds contact-agent UI choices when no tours are found', async () => {
    const handlers = {
      searchTours: jest.fn().mockResolvedValue({ success: true, tours: [] }),
    };
    const executor = new ToolExecutor(handlers);
    const metadata = { conversationId: 'conversation-123' };

    await executor.executePlan({
      steps: [{ tool: 'searchTours', args: { location: 'Nowhere' } }],
    }, metadata);

    expect(metadata.uiAction).toEqual(expect.objectContaining({
      type: 'choice',
      prompt: expect.stringContaining('No matching tours'),
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'contact_agent' }),
      ]),
    }));
  });

  it('adds a single choice action after one matching tour is found', async () => {
    const tours = [
      {
        tourId: 2,
        name: 'Sarapiqui Rainforest Tour',
        location: 'Sarapiqui',
        pricePerPerson: 95,
        durationHours: 5,
        difficulty: 'easy',
      },
    ];
    const executor = new ToolExecutor({
      searchTours: jest.fn().mockResolvedValue({ success: true, tours }),
    });
    const metadata = { conversationId: 'conversation-123' };

    await executor.executePlan({
      steps: [{ tool: 'searchTours', args: { location: 'Sarapiqui' } }],
    }, metadata);

    expect(metadata.uiAction).toEqual(expect.objectContaining({
      type: 'choice',
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'show_details' }),
        expect.objectContaining({ value: 'proceed_booking' }),
      ]),
    }));
  });

  it('adds a single tour selection action after multiple matching tours are found', async () => {
    const tours = [
      {
        tourId: 2,
        name: 'Sarapiqui Rainforest Tour',
        location: 'Sarapiqui',
        pricePerPerson: 95,
        durationHours: 5,
        difficulty: 'easy',
      },
      {
        tourId: 9,
        name: 'Palo Verde Wetlands Birding',
        location: 'Palo Verde National Park',
        pricePerPerson: 105,
        durationHours: 4,
        difficulty: 'easy',
      },
    ];
    const executor = new ToolExecutor({
      searchTours: jest.fn().mockResolvedValue({ success: true, tours }),
    });
    const metadata = { conversationId: 'conversation-123' };

    await executor.executePlan({
      steps: [{ tool: 'searchTours', args: { difficulty: 'easy' } }],
    }, metadata);

    expect(metadata.uiAction).toEqual(expect.objectContaining({
      type: 'tour_selection',
      options: [
        expect.objectContaining({
          label: 'Sarapiqui Rainforest Tour',
          value: { tourId: 2, tourName: 'Sarapiqui Rainforest Tour' },
        }),
        expect.objectContaining({
          label: 'Palo Verde Wetlands Birding',
          value: { tourId: 9, tourName: 'Palo Verde Wetlands Birding' },
        }),
      ],
    }));
  });

  it('adds a transportation selection action after transportation options are calculated', async () => {
    const executor = new ToolExecutor({
      calculateTransportation: jest.fn().mockResolvedValue({
        success: true,
        origin: 'San Jose',
        destination: 'Monteverde',
        estimatedTravelTime: '3.5-4.5 hours from San Jose',
        options: [
          {
            type: 'shared_shuttle',
            pricePerPerson: 65,
            totalPrice: 195,
            currency: 'USD',
          },
          {
            type: 'private_transfer',
            totalPrice: 220,
            currency: 'USD',
          },
        ],
        recommendedOption: 'shared_shuttle',
      }),
    });
    const metadata = { conversationId: 'conversation-123' };

    await executor.executePlan({
      steps: [{ tool: 'calculateTransportation', args: { location: 'Monteverde', participants: 3 } }],
    }, metadata);

    expect(metadata.uiAction).toEqual({
      type: 'transportation_selection',
      prompt: 'Which transportation option would you prefer for San Jose to Monteverde?',
      options: [
        expect.objectContaining({
          label: 'Shared shuttle',
          value: expect.objectContaining({
            transportationOption: 'shared_shuttle',
            origin: 'San Jose',
            destination: 'Monteverde',
            totalPrice: 195,
            currency: 'USD',
          }),
          recommended: true,
        }),
        expect.objectContaining({
          label: 'Private transfer',
          value: expect.objectContaining({
            transportationOption: 'private_transfer',
            origin: 'San Jose',
            destination: 'Monteverde',
            totalPrice: 220,
            currency: 'USD',
          }),
          recommended: false,
        }),
      ],
    });
  });

  it('keeps selected-tour metadata and returns transportation selection before confirmation', async () => {
    const executor = new ToolExecutor({
      checkAvailability: jest.fn().mockResolvedValue({
        success: true,
        tourId: 1,
        name: 'Tapir Valley Birding Tour',
        location: 'Tenorio-Bijagua and Río Celeste / Tapir Valley Nature Reserve',
        pricePerPerson: 200,
        availableSlots: 8,
        durationHours: 4,
        difficulty: 'Easy',
      }),
      calculateTransportation: jest.fn().mockResolvedValue({
        success: true,
        origin: 'San Jose',
        destination: 'Tenorio-Bijagua and Rio Celeste',
        estimatedTravelTime: '3.5-4.5 hours from San Jose',
        options: [
          {
            type: 'shared_shuttle',
            pricePerPerson: 75,
            totalPrice: 225,
            currency: 'USD',
          },
          {
            type: 'private_transfer',
            totalPrice: 260,
            currency: 'USD',
          },
        ],
        recommendedOption: 'shared_shuttle',
      }),
    });
    const metadata = {
      conversationId: 'conversation-123',
      agentPlan: { status: 'transportation_requested' },
      requestedTransportation: true,
      customerContext: {
        customerName: 'Jose Sanchez',
        customerEmail: 'jose@example.com',
        itineraryStartDate: '2026-06-03',
        itineraryEndDate: '2026-06-03',
      },
    };

    await executor.executePlan({
      steps: [
        { tool: 'checkAvailability', args: { tourId: 1, participants: 3 } },
        {
          tool: 'calculateTransportation',
          args: {
            tourId: 1,
            tourName: 'Tapir Valley Birding Tour',
            location: 'Tenorio-Bijagua and Río Celeste / Tapir Valley Nature Reserve',
            participants: 3,
          },
        },
      ],
    }, metadata);

    expect(metadata.selectedTour).toMatchObject({
      tourId: 1,
      name: 'Tapir Valley Birding Tour',
    });
    expect(metadata.requestedTransportation).toBe(true);
    expect(metadata.uiAction).toEqual(expect.objectContaining({
      type: 'transportation_selection',
      options: expect.arrayContaining([
        expect.objectContaining({
          value: expect.objectContaining({
            transportationOption: 'shared_shuttle',
            totalPrice: 225,
          }),
        }),
      ]),
    }));
    expect(metadata.uiAction.type).not.toBe('reservation_confirmation');
  });

  it('keeps transportation selection when availability follows transportation with complete booking context', async () => {
    const executor = new ToolExecutor({
      calculateTransportation: jest.fn().mockResolvedValue({
        success: true,
        origin: 'San Jose',
        destination: 'Monteverde',
        estimatedTravelTime: '3.5-4.5 hours from San Jose',
        options: [
          {
            type: 'shared_shuttle',
            pricePerPerson: 65,
            totalPrice: 195,
            currency: 'USD',
          },
          {
            type: 'private_transfer',
            totalPrice: 220,
            currency: 'USD',
          },
        ],
        recommendedOption: 'shared_shuttle',
      }),
      checkAvailability: jest.fn().mockResolvedValue({
        success: true,
        tourId: 1,
        name: 'Monteverde Quetzal Tour',
        location: 'Monteverde',
        pricePerPerson: 120,
        availableSlots: 5,
        durationHours: 4,
        difficulty: 'moderate',
      }),
    });
    const metadata = {
      conversationId: 'conversation-123',
      agentPlan: { status: 'transportation_selected' },
      customerContext: {
        customerName: 'Jose Sanchez',
        customerEmail: 'jose@example.com',
        itineraryStartDate: '2026-05-23',
        itineraryEndDate: '2026-05-26',
      },
    };

    await executor.executePlan({
      steps: [
        { tool: 'calculateTransportation', args: { location: 'Monteverde', participants: 3 } },
        { tool: 'checkAvailability', args: { tourId: 1, participants: 3 } },
      ],
    }, metadata);

    expect(metadata.uiAction).toEqual(expect.objectContaining({
      type: 'transportation_selection',
      options: expect.arrayContaining([
        expect.objectContaining({
          value: expect.objectContaining({ transportationOption: 'shared_shuttle' }),
        }),
      ]),
    }));
  });

  it('returns a participant-count action for selected tours without participant count', async () => {
    const executor = new ToolExecutor({
      checkAvailability: jest.fn().mockResolvedValue({
        success: true,
        tourId: 2,
        name: 'Sarapiqui Rainforest Tour',
        location: 'Sarapiqui',
        pricePerPerson: 95,
        availableSlots: 3,
        durationHours: 5,
        difficulty: 'easy',
      }),
    });
    const metadata = {
      conversationId: 'conversation-123',
      agentPlan: { status: 'select_tour' },
      customerContext: {
        customerName: 'Jose Sanchez',
        customerEmail: 'jose@example.com',
        itineraryStartDate: '2026-05-23',
        itineraryEndDate: '2026-05-26',
      },
    };

    await executor.executePlan({
      steps: [{ tool: 'checkAvailability', args: { tourId: 2 } }],
    }, metadata);

    expect(metadata.uiAction).toEqual({
      type: 'participant_count',
      prompt: 'How many participants should I reserve?',
      min: 1,
      max: 3,
      options: [
        { label: '1', value: 1 },
        { label: '2', value: 2 },
        { label: '3', value: 3 },
      ],
    });
    expect(metadata.selectedTour).toMatchObject({
      tourId: 2,
      name: 'Sarapiqui Rainforest Tour',
    });
  });

  it('asks for transportation preference when selected tour and customer context are complete but preference is unknown', async () => {
    const executor = new ToolExecutor({
      checkAvailability: jest.fn().mockResolvedValue({
        success: true,
        tourId: 2,
        name: 'Sarapiqui Rainforest Tour',
        location: 'Sarapiqui',
        pricePerPerson: 95,
        availableSlots: 3,
        durationHours: 5,
        difficulty: 'easy',
      }),
    });
    const metadata = {
      conversationId: 'conversation-123',
      agentPlan: { status: 'needs_transportation_preference' },
      customerContext: {
        customerName: 'Jose Sanchez',
        customerEmail: 'jose@example.com',
        itineraryStartDate: '2026-05-23',
        itineraryEndDate: '2026-05-26',
      },
    };

    await executor.executePlan({
      steps: [{ tool: 'checkAvailability', args: { tourId: 2, participants: 2 } }],
    }, metadata);

    expect(metadata.uiAction).toEqual(expect.objectContaining({
      type: 'choice',
      prompt: 'Would you like transportation for this tour?',
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'show_transportation' }),
        expect.objectContaining({ value: 'decline_transportation' }),
      ]),
    }));
  });

  it('returns a final confirmation action after transportation is declined', async () => {
    const executor = new ToolExecutor({
      checkAvailability: jest.fn().mockResolvedValue({
        success: true,
        tourId: 2,
        name: 'Sarapiqui Rainforest Tour',
        location: 'Sarapiqui',
        pricePerPerson: 95,
        availableSlots: 3,
        durationHours: 5,
        difficulty: 'easy',
      }),
    });
    const metadata = {
      conversationId: 'conversation-123',
      agentPlan: { status: 'transportation_declined' },
      transportationDeclined: true,
      customerContext: {
        customerName: 'Jose Sanchez',
        customerEmail: 'jose@example.com',
        itineraryStartDate: '2026-05-23',
        itineraryEndDate: '2026-05-26',
      },
    };

    await executor.executePlan({
      steps: [{ tool: 'checkAvailability', args: { tourId: 2, participants: 2 } }],
    }, metadata);

    expect(metadata.uiAction).toEqual(expect.objectContaining({
      type: 'reservation_confirmation',
      prompt: 'Confirm this reservation?',
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'confirm_reservation' }),
        expect.objectContaining({ value: 'cancel_reservation' }),
      ]),
    }));
  });

  it('returns a final confirmation action with pricing after transportation selection when booking context is complete', async () => {
    const executor = new ToolExecutor({
      checkAvailability: jest.fn().mockResolvedValue({
        success: true,
        tourId: 1,
        name: 'Monteverde Quetzal Tour',
        location: 'Monteverde',
        pricePerPerson: 120,
        availableSlots: 5,
        durationHours: 4,
        difficulty: 'moderate',
      }),
      calculatePricing: jest.fn().mockResolvedValue({
        success: true,
        tourId: 1,
        participants: 3,
        subtotal: 360,
        totalPrice: 360,
        currency: 'USD',
      }),
    });
    const metadata = {
      conversationId: 'conversation-123',
      agentPlan: { status: 'transportation_selected' },
      selectedTransportation: {
        transportationOption: 'shared_shuttle',
        origin: 'San Jose',
        destination: 'Monteverde',
        totalPrice: 195,
        currency: 'USD',
      },
      customerContext: {
        customerName: 'Jose Sanchez',
        customerEmail: 'jose@example.com',
        itineraryStartDate: '2026-05-23',
        itineraryEndDate: '2026-05-26',
      },
    };

    await executor.executePlan({
      steps: [
        { tool: 'checkAvailability', args: { tourId: 1, participants: 3 } },
        { tool: 'calculatePricing', args: { tourId: 1, participants: 3 } },
      ],
    }, metadata);

    expect(metadata.participants).toBe(3);
    expect(metadata.pricing).toEqual({
      tourSubtotal: 360,
      transportationTotal: 195,
      total: 555,
      currency: 'USD',
    });
    expect(metadata.uiAction).toEqual(expect.objectContaining({
      type: 'reservation_confirmation',
      prompt: 'Confirm this reservation?',
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'confirm_reservation' }),
        expect.objectContaining({ value: 'cancel_reservation' }),
      ]),
    }));
  });

  it('stores transportation-aware reservation results in response metadata', async () => {
    const executor = new ToolExecutor({
      createReservation: jest.fn().mockResolvedValue({
        success: true,
        reservationId: 12,
        confirmationCode: 'BW-MP93E5OO-A93F6D',
        customerName: 'Jose Sanchez',
        customerEmail: 'jose@example.com',
        tourId: 1,
        tourName: 'Monteverde Quetzal Tour',
        participants: 3,
        totalPrice: 360,
        tourTotalPrice: 360,
        transportation: {
          transportationOption: 'shared_shuttle',
          label: 'Shared shuttle',
          origin: 'San Jose',
          destination: 'Monteverde',
          pricePerPerson: 65,
          totalPrice: 195,
          currency: 'USD',
        },
        transportationPrice: 195,
        grandTotalPrice: 555,
        currency: 'USD',
      }),
    });
    const metadata = { conversationId: 'conversation-123' };

    await executor.executePlan({
      steps: [{ tool: 'createReservation', args: { tourId: 1, participants: 3 } }],
    }, metadata);

    expect(metadata.reservation).toMatchObject({
      reservationId: 12,
      totalPrice: 360,
      tourTotalPrice: 360,
      transportationPrice: 195,
      grandTotalPrice: 555,
      transportation: {
        transportationOption: 'shared_shuttle',
        label: 'Shared shuttle',
        origin: 'San Jose',
        destination: 'Monteverde',
        totalPrice: 195,
      },
    });
  });

  it('adds selected transportation from planner output to response metadata', async () => {
    const selectedTransportation = {
      transportationOption: 'shared_shuttle',
      origin: 'San Jose',
      destination: 'Monteverde',
    };
    const planner = {
      plan: jest.fn().mockReturnValue({
        status: 'transportation_selected',
        selectedTransportation,
        steps: [],
      }),
    };
    const executor = {
      executePlan: jest.fn().mockResolvedValue([]),
    };
    const aiClient = {
      streamChatCompletion: jest.fn().mockResolvedValue('Great choice. Ready to confirm?'),
    };
    const orchestrator = new AgentOrchestrator({
      agent: { planner, executor },
      aiClient,
      intentExtractor: createValidIntentExtractor(),
    });
    const metadata = { conversationId: 'conversation-123' };

    await orchestrator.generateResponse([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'I choose shared shuttle from San Jose to Monteverde' },
    ], metadata);

    expect(metadata.selectedTransportation).toEqual(selectedTransportation);
    expect(executor.executePlan).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'transportation_selected' }),
      expect.objectContaining({ selectedTransportation })
    );
    expect(aiClient.streamChatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('"selectedTransportation"'),
        }),
      ]),
      expect.objectContaining({
        onChunk: expect.any(Function),
      })
    );
  });

  it('carries selected transportation from recent metadata into confirmation tools', async () => {
    const selectedTransportation = {
      transportationOption: 'shared_shuttle',
      label: 'Shared shuttle',
      origin: 'San Jose',
      destination: 'Monteverde',
      pricePerPerson: 65,
      totalPrice: 195,
      currency: 'USD',
    };
    const planner = {
      plan: jest.fn().mockReturnValue({
        status: 'ready',
        steps: [
          { tool: 'checkAvailability', args: { tourId: 1, participants: 3 } },
          { tool: 'calculatePricing', args: { tourId: 1, participants: 3 } },
          { tool: 'createReservation', args: { tourId: 1, participants: 3 } },
        ],
      }),
    };
    const executor = {
      executePlan: jest.fn().mockResolvedValue([]),
    };
    const aiClient = {
      streamChatCompletion: jest.fn().mockResolvedValue('Your reservation is confirmed.'),
    };
    const orchestrator = new AgentOrchestrator({
      agent: { planner, executor },
      aiClient,
      intentExtractor: createValidIntentExtractor(),
    });
    const metadata = {
      conversationId: 'conversation-123',
      conversationContext: {
        recentAssistantMetadata: {
          selectedTransportation,
        },
      },
    };

    await orchestrator.generateResponse([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Confirm reservation' },
    ], metadata);

    expect(metadata.selectedTransportation).toEqual(selectedTransportation);
    expect(executor.executePlan).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ selectedTransportation })
    );
    expect(aiClient.streamChatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('"selectedTransportation"'),
        }),
      ]),
      expect.objectContaining({
        onChunk: expect.any(Function),
      })
    );
  });

  it('instructs the final response not to confirm when reservation creation fails', async () => {
    const planner = {
      plan: jest.fn().mockReturnValue({
        status: 'ready',
        steps: [
          { tool: 'createReservation', args: { tourId: 1, participants: 3 } },
        ],
      }),
    };
    const executor = {
      executePlan: jest.fn().mockResolvedValue({
        success: false,
        steps: [
          {
            tool: 'createReservation',
            result: {
              success: false,
              code: 'DATABASE_UNAVAILABLE',
              message: 'Reservation storage is temporarily unavailable.',
            },
          },
        ],
        errors: [
          {
            tool: 'createReservation',
            code: 'DATABASE_UNAVAILABLE',
            message: 'Reservation storage is temporarily unavailable.',
          },
        ],
      }),
    };
    const aiClient = {
      streamChatCompletion: jest.fn().mockResolvedValue('I could not complete the reservation right now.'),
    };
    const orchestrator = new AgentOrchestrator({
      agent: { planner, executor },
      aiClient,
      intentExtractor: createValidIntentExtractor(),
    });
    const metadata = { conversationId: 'conversation-123' };

    await orchestrator.generateResponse([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Confirm reservation' },
    ], metadata);

    expect(metadata.reservation).toBeUndefined();
    expect(metadata).toMatchObject({
      degradedMode: true,
      unavailableCapabilities: ['reservation_tool'],
    });
    expect(aiClient.streamChatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('The reservation was not saved in the database'),
        }),
      ]),
      expect.objectContaining({
        onChunk: expect.any(Function),
      })
    );
  });

  it('combines tool outputs into the final model prompt', async () => {
    const planner = {
      plan: jest.fn().mockReturnValue({
        status: 'ready',
        steps: [
          { tool: 'checkAvailability', args: { tourId: 5, participants: 2 } },
          { tool: 'calculatePricing', args: { tourId: 5, participants: 2 } },
        ],
      }),
    };
    const executor = {
      executePlan: jest.fn().mockResolvedValue([
        {
          tool: 'checkAvailability',
          result: { success: true, tourId: 5, availableSlots: 6 },
        },
        {
          tool: 'calculatePricing',
          result: { success: true, tourId: 5, totalPrice: 240 },
        },
      ]),
    };
    const aiClient = {
      streamChatCompletion: jest.fn().mockResolvedValue('Tour 5 has space and costs $240.'),
    };
    const orchestrator = new AgentOrchestrator({
      agent: { planner, executor },
      aiClient,
      intentExtractor: createValidIntentExtractor('check_availability'),
    });

    await orchestrator.generateResponse([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Is tour 5 available and what is the price for 2 people?' },
    ], {
      conversationId: 'conversation-123',
    });

    expect(executor.executePlan).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ready' }),
      expect.objectContaining({ conversationId: 'conversation-123' })
    );
    expect(aiClient.streamChatCompletion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('calculatePricing'),
        }),
      ]),
      expect.objectContaining({
        onChunk: expect.any(Function),
      })
    );
  });

  it('reuses finalized tool results and executes the tool plan only once during model fallback', async () => {
    const planner = {
      plan: jest.fn().mockReturnValue({
        status: 'ready',
        steps: [{ tool: 'searchTours', args: { location: 'Monteverde' } }],
      }),
    };
    const executor = {
      executePlan: jest.fn().mockResolvedValue({
        success: true,
        steps: [{
          tool: 'searchTours',
          result: { success: true, tours: [{ tourId: 1, name: 'Quetzal Tour' }] },
        }],
        errors: [],
      }),
    };
    const providerFailure = Object.assign(new Error('temporary outage'), { status: 503 });
    const aiClient = {
      streamChatCompletion: jest.fn()
        .mockRejectedValueOnce(providerFailure)
        .mockResolvedValueOnce('Fallback answer from the same tool results.'),
    };
    const modelRouter = jest.fn().mockReturnValue({
      task: 'tour_recommendation',
      route: 'balanced',
      primaryModel: { key: 'primary', modelId: 'provider-primary' },
      fallbackModels: [{ key: 'fallback', modelId: 'provider-fallback' }],
      reasoningEffort: 'medium',
      timeoutMs: 10_000,
      maxRetries: 0,
      reasonCode: 'TEST_ROUTE',
    });
    const orchestrator = new AgentOrchestrator({
      agent: { planner, executor },
      aiClient,
      modelRouter,
      taskClassifier: jest.fn().mockReturnValue('tour_recommendation'),
      intentExtractor: createValidIntentExtractor('search'),
    });

    const metadata = {
      conversationId: 'conversation-123',
    };

    await expect(orchestrator.generateResponse([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Find tours in Monteverde' },
    ], metadata)).resolves.toBe('Fallback answer from the same tool results.');

    expect(executor.executePlan).toHaveBeenCalledTimes(1);
    expect(metadata).toMatchObject({
      degradedMode: true,
      unavailableCapabilities: ['advanced_model'],
    });
    expect(aiClient.streamChatCompletion).toHaveBeenCalledTimes(2);
    const primaryMessages = aiClient.streamChatCompletion.mock.calls[0][0];
    const fallbackMessages = aiClient.streamChatCompletion.mock.calls[1][0];
    expect(fallbackMessages).toEqual(primaryMessages);
    expect(aiClient.streamChatCompletion.mock.calls.map(([, options]) => options.model))
      .toEqual(['provider-primary', 'provider-fallback']);
    expect(aiClient.streamChatCompletion.mock.calls.map(([, options]) => ({
      parentTraceId: options.metadata.parentTraceId,
      agentTraceId: options.metadata.agentTraceId,
      conversationId: options.metadata.conversationId,
      modelRouteAttempt: options.metadata.modelRouteAttempt,
    }))).toEqual([
      expect.objectContaining({
        agentTraceId: expect.any(String),
        conversationId: 'conversation-123',
        modelRouteAttempt: {
          modelKey: 'primary',
          attemptRole: 'primary',
          routePosition: 0,
          sameModelAttempt: 1,
        },
      }),
      expect.objectContaining({
        agentTraceId: expect.any(String),
        conversationId: 'conversation-123',
        modelRouteAttempt: {
          modelKey: 'fallback',
          attemptRole: 'fallback',
          routePosition: 1,
          sameModelAttempt: 1,
        },
      }),
    ]);
  });

  it('uses verified tour results when every model route is unavailable', async () => {
    const planner = {
      plan: jest.fn().mockReturnValue({
        status: 'ready',
        steps: [{ tool: 'searchTours', args: { location: 'Monteverde' } }],
      }),
    };
    const executor = {
      executePlan: jest.fn().mockImplementation(async (plan, metadata) => {
        metadata.tours = [{ tourId: 1, name: 'Quetzal Tour', location: 'Monteverde' }];
        return {
          success: true,
          steps: [{
            tool: 'searchTours',
            result: { success: true, tours: metadata.tours },
          }],
          errors: [],
        };
      }),
    };
    const routeError = Object.assign(new Error('routes exhausted'), {
      status: 503,
      code: 'MODEL_ROUTES_EXHAUSTED',
    });
    const modelRouteExecutor = jest.fn().mockRejectedValue(routeError);
    const onChunk = jest.fn();
    const metadata = { conversationId: 'conversation-123' };
    const orchestrator = new AgentOrchestrator({
      agent: { planner, executor },
      modelRouteExecutor,
      intentExtractor: createValidIntentExtractor('search'),
    });

    const response = await orchestrator.generateResponse([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Find tours in Monteverde' },
    ], metadata, { onChunk });

    expect(response).toContain('1 available tour option');
    expect(response).toContain('personalized AI recommendations are temporarily unavailable');
    expect(metadata).toMatchObject({
      degradedMode: true,
      unavailableCapabilities: ['advanced_model'],
    });
    expect(executor.executePlan).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith(response);
  });

  it('retains the normal model error when no truthful useful fallback exists', async () => {
    const routeError = Object.assign(new Error('routes exhausted'), {
      status: 503,
      code: 'MODEL_ROUTES_EXHAUSTED',
    });
    const orchestrator = new AgentOrchestrator({
      agent: {
        planner: { plan: jest.fn().mockReturnValue({ status: 'ready', steps: [] }) },
        executor: { executePlan: jest.fn().mockResolvedValue({ success: true, steps: [], errors: [] }) },
      },
      modelRouteExecutor: jest.fn().mockRejectedValue(routeError),
    });

    await expect(orchestrator.generateResponse([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
    ], {
      conversationId: 'conversation-123',
    })).rejects.toBe(routeError);
  });

  it('logs orchestration phases and appends orchestration trace events', async () => {
    const log = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const planner = {
      plan: jest.fn().mockReturnValue({
        status: 'ready',
        steps: [{ id: 'search', tool: 'searchTours', args: { location: 'Monteverde' } }],
      }),
    };
    const executor = new ToolExecutor({
      searchTours: jest.fn().mockResolvedValue({ success: true, tours: [] }),
    }, { logger: log });
    const aiClient = {
      streamChatCompletion: jest.fn().mockResolvedValue('I found available tours.'),
    };
    const orchestrator = new AgentOrchestrator({
      agent: { planner, executor },
      aiClient,
      intentExtractor: createValidIntentExtractor('search'),
      log,
    });
    const metadata = { conversationId: 'conversation-123' };

    await orchestrator.generateResponse([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Find Monteverde tours' },
    ], metadata);

    expect(metadata.agentDebugTrace.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'tool_plan_started' }),
      expect.objectContaining({ event: 'tool_step_started', tool: 'searchTours' }),
      expect.objectContaining({ event: 'tool_step_completed', tool: 'searchTours' }),
      expect.objectContaining({ event: 'tool_plan_completed', success: true }),
      expect.objectContaining({ event: 'orchestration_tools_completed', success: true }),
      expect.objectContaining({ event: 'orchestration_prompt_assembled', hasToolContext: true }),
      expect.objectContaining({ event: 'orchestration_stream_started' }),
    ]));
    expect(log.info).toHaveBeenCalledWith(
      'Birdwatching agent orchestration started',
      expect.objectContaining({ conversationId: 'conversation-123', messageCount: 2 })
    );
    expect(log.info).toHaveBeenCalledWith(
      'Birdwatching agent planning completed',
      expect.objectContaining({ conversationId: 'conversation-123', status: 'ready', stepCount: 1 })
    );
    expect(log.info).toHaveBeenCalledWith(
      'Birdwatching agent final prompt assembled',
      expect.objectContaining({ conversationId: 'conversation-123', hasToolContext: true })
    );
  });
});
