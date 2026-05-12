export const tourSchema = [
  {
    type: 'function',
    function: {
      name: 'getAvailableTours',
      description: 'List available Costa Rica birdwatching tours, optionally filtered by location, difficulty, price, or group size.',
      parameters: {
        type: 'object',
        properties: {
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
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recommendTours',
      description: 'Recommend 2-3 available tours matching user preferences like location, budget, difficulty, and group size.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'Preferred location or region from the conversation.',
          },
          budget: {
            type: 'string',
            enum: ['budget', 'moderate', 'luxury'],
            description: 'Budget preference inferred from the user.',
          },
          difficulty: {
            type: 'string',
            enum: ['easy', 'moderate', 'challenging'],
            description: 'Difficulty preference inferred from the user.',
          },
          participants: {
            type: 'integer',
            description: 'Number of participants if known.',
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
      name: 'selectTour',
      description: 'Validate an explicit tour selection by ID or clear tour name before pricing or reservation.',
      parameters: {
        type: 'object',
        properties: {
          tourId: {
            type: 'integer',
            description: 'The selected tour ID. Prefer this when the user picked from displayed options.',
          },
          tourName: {
            type: 'string',
            description: 'The clear selected tour name if the user chose by name and no tour ID is known.',
          },
          participants: {
            type: 'integer',
            description: 'Optional participant count to validate slot availability.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkTourAvailability',
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
      name: 'calculateTourPrice',
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
      description: 'Create a durable reservation only after the user has explicitly selected a tour.',
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
            description: 'Name for the reservation.',
          },
          customerEmail: {
            type: 'string',
            description: 'Email address for reservation follow-up.',
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
