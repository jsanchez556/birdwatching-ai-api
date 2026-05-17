export const tourSchema = [
  {
    type: 'function',
    function: {
      name: 'searchTours',
      description: 'Find or recommend Costa Rica birdwatching tours based on location, budget, difficulty, price, or group size.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional free-text search query or tour/location phrase.',
          },
          location: {
            type: 'string',
            description: 'Optional preferred location or region, such as Monteverde or Tortuguero.',
          },
          difficulty: {
            type: 'string',
            enum: ['easy', 'moderate', 'challenging'],
            description: 'Optional preferred tour difficulty.',
          },
          maxPrice: {
            type: 'number',
            description: 'Optional maximum price per person in USD.',
          },
          participants: {
            type: 'integer',
            description: 'Optional group size so only tours with enough slots are listed.',
          },
          budget: {
            type: 'string',
            enum: ['budget', 'moderate', 'luxury'],
            description: 'Optional budget preference inferred from the user.',
          },
          recommend: {
            type: 'boolean',
            description: 'Use true when the user asks for recommendations or best matching options.',
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of recommendations to return. Prefer 2 or 3.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculateTransportation',
      description: 'Estimate transportation options, route timing, and transportation costs for a tour location.',
      parameters: {
        type: 'object',
        properties: {
          origin: {
            type: 'string',
            description: 'Optional pickup origin. Defaults to San Jose.',
          },
          destination: {
            type: 'string',
            description: 'Tour destination or region, such as Monteverde, Tortuguero, Sarapiqui, or Cerro de la Muerte.',
          },
          location: {
            type: 'string',
            description: 'Optional selected tour location when destination is not provided.',
          },
          tourName: {
            type: 'string',
            description: 'Optional selected tour name when location is not provided.',
          },
          participants: {
            type: 'integer',
            description: 'Optional group size for per-person transportation estimates.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check available slots and basic details for a selected Costa Rica birdwatching tour.',
      parameters: {
        type: 'object',
        properties: {
          tourId: {
            type: 'integer',
            description: 'The selected numeric tour ID to check.',
          },
          tourName: {
            type: 'string',
            description: 'Optional selected tour name when no tour ID is known.',
          },
          location: {
            type: 'string',
            description: 'Optional selected tour location when no tour ID is known, such as Cerro de la Muerte.',
          },
          participants: {
            type: 'integer',
            description: 'Optional group size to validate slot availability.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculatePricing',
      description: 'Calculate total tour price for a selected tour and participant count, including available discounts.',
      parameters: {
        type: 'object',
        properties: {
          tourId: {
            type: 'integer',
            description: 'The selected numeric tour ID to price.',
          },
          tourName: {
            type: 'string',
            description: 'Optional selected tour name when no tour ID is known.',
          },
          location: {
            type: 'string',
            description: 'Optional selected tour location when no tour ID is known.',
          },
          participants: {
            type: 'integer',
            description: 'Number of people joining the selected tour.',
          },
          discountCode: {
            type: 'string',
            description: 'Optional discount code provided by the user.',
          },
        },
        required: ['participants'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createReservation',
      description: 'Create a durable reservation only after the user has explicitly selected a tour. Prefer known customerName and customerEmail from metadata.customerContext when available.',
      parameters: {
        type: 'object',
        properties: {
          tourId: {
            type: 'integer',
            description: 'The explicitly selected numeric tour ID to reserve.',
          },
          tourName: {
            type: 'string',
            description: 'Optional selected tour name when no tour ID is known.',
          },
          location: {
            type: 'string',
            description: 'Optional selected tour location when no tour ID is known, such as Cerro de la Muerte.',
          },
          participants: {
            type: 'integer',
            description: 'Number of reserved participants.',
          },
          customerName: {
            type: 'string',
            description: 'Name for the reservation. Use metadata.customerContext.customerName when available instead of asking again.',
          },
          customerEmail: {
            type: 'string',
            description: 'Email address for reservation follow-up. Use metadata.customerContext.customerEmail when available instead of asking again.',
          },
          discountCode: {
            type: 'string',
            description: 'Optional discount code provided by the user.',
          },
        },
        required: ['participants', 'customerName'],
      },
    },
  },
];
