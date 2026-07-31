import { z } from 'zod';

const CONVERSATION_SUMMARY_SCHEMA_VERSION = '1.0.0';

const ConfirmedFactSchema = z.object({
  fact: z.string().min(1),
  sourceMessageIds: z.array(z.string().min(1)).min(1),
}).strict();

const PendingActionSchema = z.object({
  action: z.string().min(1),
  status: z.enum(['pending', 'requires_confirmation']),
}).strict();

const ConversationSummarySchema = z.object({
  userGoal: z.string().min(1).nullable(),
  confirmedFacts: z.array(ConfirmedFactSchema),
  preferences: z.array(z.string().min(1)),
  decisions: z.array(z.string().min(1)),
  unresolvedQuestions: z.array(z.string().min(1)),
  pendingActions: z.array(PendingActionSchema),
  previousSummaryVersion: z.number().int().positive().nullable(),
}).strict();

export {
  CONVERSATION_SUMMARY_SCHEMA_VERSION,
  ConfirmedFactSchema,
  ConversationSummarySchema,
  PendingActionSchema,
};
