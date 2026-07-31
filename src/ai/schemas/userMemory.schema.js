import { z } from 'zod';

const UserMemoryCategorySchema = z.enum([
  'preferences',
  'accessibility_requirements',
  'recurring_travel_constraints',
  'bird_interests',
  'preferred_language',
  'budget_ranges',
]);

const UserMemoryCandidateSchema = z.object({
  category: UserMemoryCategorySchema,
  content: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  explicitlyStated: z.boolean(),
  stable: z.boolean(),
  usefulAcrossSessions: z.boolean(),
  safeToRetain: z.boolean(),
  expiresAt: z.string().nullable(),
  isUserEditable: z.boolean(),
  conflictKey: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/).nullable(),
  conflictResolution: z.enum([
    'none',
    'explicit_recent_correction',
    'clarification_required',
  ]),
  conflictsWithMemoryIds: z.array(z.number().int().positive()).max(10),
  supersedesMemoryIds: z.array(z.number().int().positive()).max(10),
}).strict();

const UserMemoryExtractionSchema = z.object({
  memories: z.array(UserMemoryCandidateSchema).max(5),
}).strict();

export {
  UserMemoryCandidateSchema,
  UserMemoryCategorySchema,
  UserMemoryExtractionSchema,
};
