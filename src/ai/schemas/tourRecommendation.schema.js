import { z } from 'zod';

const AvailabilityStatusSchema = z.enum([
  'available',
  'limited',
  'unavailable',
  'unknown',
]);

const EstimatedPriceSchema = z.object({
  amount: z.number().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
}).strict().superRefine((price, context) => {
  if ((price.amount === null) !== (price.currency === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'amount and currency must both be known or both be null',
    });
  }
});

const TourRecommendationItemSchema = z.object({
  tourId: z.string().trim().min(1),
  tourName: z.string().trim().min(1),
  type: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1),
  estimatedPrice: EstimatedPriceSchema,
  matchReasons: z.array(z.string().trim().min(3)).min(1),
  availabilityStatus: AvailabilityStatusSchema,
  confidence: z.number().min(0).max(1),
}).strict();

const TourRecommendationSourceSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().url().refine(
    (value) => value.startsWith('https://') || value.startsWith('http://'),
    'source URL must use HTTP or HTTPS'
  ).nullable(),
}).strict();

const TourRecommendationSchema = z.object({
  summary: z.string().trim().min(1),
  recommendations: z.array(TourRecommendationItemSchema),
  sources: z.array(TourRecommendationSourceSchema),
  assumptions: z.array(z.string().trim().min(1)),
  followUpQuestion: z.string().trim().min(1).nullable(),
}).strict();

/**
 * @typedef {z.infer<typeof TourRecommendationSchema>} TourRecommendation
 */

export {
  AvailabilityStatusSchema,
  EstimatedPriceSchema,
  TourRecommendationItemSchema,
  TourRecommendationSchema,
  TourRecommendationSourceSchema,
};
