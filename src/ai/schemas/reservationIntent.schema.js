import { z } from 'zod';

const ReservationFieldSchema = z.enum([
  'tourId',
  'location',
  'date',
  'participants',
  'transportationRequired',
  'pickupLocation',
  'discountCode',
]);

const ReservationIntentSchema = z.object({
  intent: z.enum([
    'search',
    'check_availability',
    'calculate_price',
    'create_reservation',
    'unknown',
  ]),
  tourId: z.string().min(1).nullable(),
  location: z.string().min(1).nullable(),
  date: z.string().min(1).nullable(),
  participants: z.number().int().positive().nullable(),
  transportationRequired: z.boolean().nullable(),
  pickupLocation: z.string().min(1).nullable(),
  discountCode: z.string().min(1).nullable(),
  clearedFields: z.array(ReservationFieldSchema),
  missingFields: z.array(ReservationFieldSchema),
  confidence: z.number().min(0).max(1),
}).strict();

export {
  ReservationFieldSchema,
  ReservationIntentSchema,
};
