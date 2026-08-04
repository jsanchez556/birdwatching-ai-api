import observabilityService from '../observability/observability.service.js';
import { toNormalizedContextTelemetry } from '../ai/context/contextMetrics.js';

function traceContextAssembly(name, metadata, operation) {
  return withAiTrace({
    type: 'context_assembly',
    name,
    metadata,
    outputMetadata: (result = {}) => ({
      ...toNormalizedContextTelemetry(result.metrics),
      stage: result.metrics?.stage,
      task: result.metrics?.task,
      model: result.metrics?.model,
      estimatedInputTokens: result.estimatedTokens,
      candidateItemCount: result.metrics?.candidateItemCount,
      selectedItemCount: result.metrics?.selectedItemCount,
      droppedItemCount: result.metrics?.droppedItemCount,
      provenanceItemCount: result.traceProvenance?.length || 0,
      contextProvenance: result.traceProvenance || [],
    }),
  }, operation);
}

function safeResultCount(result) {
  if (Array.isArray(result)) return result.length;
  if (Array.isArray(result?.documents)) return result.documents.length;
  if (Array.isArray(result?.sources)) return result.sources.length;
  if (Array.isArray(result?.steps)) return result.steps.length;
  if (Array.isArray(result?.tours)) return result.tours.length;
  return undefined;
}

function tokenUsageFromCompletion(completion = {}) {
  return completion.usage;
}

function withAiTrace({
  type,
  name,
  metadata = {},
  traceId,
  tokenUsage,
  outputMetadata,
} = {}, operation) {
  return observabilityService.trace({
    type,
    name,
    metadata,
    parentTraceId: metadata.parentTraceId,
    traceId,
    tokenUsage,
    outputMetadata,
  }, operation);
}

function traceLlmCall(name, metadata, operation, options = {}) {
  return withAiTrace({
    type: 'llm',
    name,
    metadata,
    tokenUsage: options.tokenUsage || tokenUsageFromCompletion,
    outputMetadata: options.outputMetadata,
  }, operation);
}

function traceAiExecutionFlow(name, metadata, operation, options = {}) {
  return withAiTrace({
    type: 'ai_execution_flow',
    name,
    metadata,
    traceId: options.traceId,
    outputMetadata: (result = {}) => ({
      conversationId: result.conversationId,
      responseLength: result.response?.length || 0,
      sourceCount: result.sources?.length || 0,
      hasReservation: Boolean(result.meta?.reservation),
      toolsCalled: result.meta?.toolsCalled || [],
      promptVersions: result.meta?.promptVersions,
      experimentAssignments: result.meta?.experimentAssignments,
    }),
  }, operation);
}

function traceBirdIdentificationPipeline(name, metadata, operation, options = {}) {
  return withAiTrace({
    type: 'bird_identification_pipeline',
    name,
    metadata,
    traceId: options.traceId,
    outputMetadata: (result = {}) => ({
      hasImageObservations: Boolean(result.imageObservations),
      summaryLength: result.summary?.length || 0,
      candidateCount: result.candidates?.length || 0,
      topCandidate: result.candidates?.[0]?.commonName || result.candidates?.[0]?.species,
      topConfidence: result.candidates?.[0]?.confidence,
      promptVersions: result.promptVersions,
      retrievedChunkCount: result.ragTrace?.retrievedChunkCount,
      sourceCount: result.ragTrace?.sourceCount,
    }),
  }, operation);
}

function traceImageInput(name, metadata, operation) {
  return withAiTrace({
    type: 'image_input',
    name,
    metadata,
    outputMetadata: (result = {}) => ({
      hasImageUrl: Boolean(result.hasImageUrl),
      imageUrlLength: result.imageUrlLength,
      userIdPresent: Boolean(result.userIdPresent),
    }),
  }, operation);
}

function traceBirdIdentificationRagRetrieval(name, metadata, operation) {
  return withAiTrace({
    type: 'rag_retrieval',
    name,
    metadata,
    outputMetadata: (result = {}) => ({
      sourceCount: result.sources?.length || 0,
      birdMatchCount: result.birdMatches?.length || 0,
      retrievedChunkCount: result.ragTrace?.retrievedChunkCount,
      contextMessageLength: result.ragTrace?.contextMessageLength,
    }),
  }, operation);
}

function traceBirdIdentificationFinalResponse(name, metadata, operation) {
  return withAiTrace({
    type: 'final_response',
    name,
    metadata,
    outputMetadata: (result = {}) => ({
      summaryLength: result.summary?.length || 0,
      candidateCount: result.candidates?.length || 0,
      topCandidate: result.candidates?.[0]?.commonName || result.candidates?.[0]?.species,
      topConfidence: result.candidates?.[0]?.confidence,
      retrievedChunkCount: result.ragTrace?.retrievedChunkCount,
      sourceCount: result.ragTrace?.sourceCount,
    }),
  }, operation);
}

function traceConversationContext(name, metadata, operation) {
  return withAiTrace({
    type: 'conversation_context',
    name,
    metadata,
    outputMetadata: (messages = []) => ({
      messageCount: Array.isArray(messages) ? messages.length : 0,
      roleCounts: Array.isArray(messages)
        ? messages.reduce((counts, message) => ({
          ...counts,
          [message.role]: (counts[message.role] || 0) + 1,
        }), {})
        : {},
    }),
  }, operation);
}

function traceRagRetrieval(name, metadata, operation) {
  return withAiTrace({
    type: 'rag_retrieval',
    name,
    metadata,
    outputMetadata: (result) => ({ resultCount: safeResultCount(result) }),
  }, operation);
}

function traceRagPipeline(name, metadata, operation, options = {}) {
  return withAiTrace({
    type: 'rag_pipeline',
    name,
    metadata,
    outputMetadata: options.outputMetadata,
  }, operation);
}

function traceCacheOperation(name, metadata, operation) {
  return withAiTrace({
    type: 'cache',
    name,
    metadata,
    outputMetadata: (result = {}) => ({
      cacheName: result.cacheName || metadata.cacheName,
      cacheStatus: result.status,
      cacheHit: result.status === 'hit',
      cacheMiss: result.status === 'miss',
      cacheSkipped: result.status === 'skipped',
      avoidedLlmCall: Boolean(result.avoidedLlmCall),
      cacheHits: result.cacheHits,
      cacheMisses: result.cacheMisses,
      cacheHitRate: result.cacheHitRate,
      estimatedSavings: result.estimatedSavings,
      writeSucceeded: result.writeSucceeded,
      errorCode: result.errorCode,
    }),
  }, operation);
}

function traceToolExecution(name, metadata, operation) {
  return withAiTrace({
    type: 'tool_execution',
    name,
    metadata,
    outputMetadata: (result) => ({
      success: result?.success !== false,
      code: result?.code,
      resultCount: safeResultCount(result),
      attempts: result?.toolExecutionAttempts?.length,
    }),
  }, operation);
}

function traceAgentOrchestration(name, metadata, operation) {
  return withAiTrace({
    type: 'agent_orchestration',
    name,
    metadata,
    outputMetadata: (result) => ({
      resultType: typeof result,
      resultLength: typeof result === 'string' ? result.length : undefined,
      resultCount: safeResultCount(result),
    }),
  }, operation);
}

function traceAgentPlanning(name, metadata, operation) {
  return withAiTrace({
    type: 'agent_planning',
    name,
    metadata,
    outputMetadata: (plan = {}) => ({
      status: plan.status,
      stepCount: plan.steps?.length || 0,
      tools: (plan.steps || []).map((step) => step.tool).filter(Boolean),
      hasPlannerMessage: Boolean(plan.message),
      selectedTransportation: Boolean(plan.selectedTransportation),
      transportationDeclined: Boolean(plan.transportationDeclined),
      requestedTransportation: Boolean(plan.requestedTransportation),
    }),
  }, operation);
}

function traceAgentToolSequence(name, metadata, operation) {
  return withAiTrace({
    type: 'tool_sequence',
    name,
    metadata,
    outputMetadata: (result = {}) => ({
      success: result.success,
      executedStepCount: result.steps?.length || 0,
      errorCount: result.errors?.length || 0,
      skippedStepCount: result.debugTrace?.skippedSteps?.length || 0,
      tools: (result.steps || []).map((step) => step.tool).filter(Boolean),
      failures: result.errors || [],
      retries: (result.debugTrace?.executions || [])
        .map((execution) => ({
          id: execution.id,
          tool: execution.tool,
          attempts: execution.attempts?.length || 0,
          retryCount: Math.max((execution.attempts?.length || 1) - 1, 0),
          failedAttempts: (execution.attempts || []).filter((attempt) => attempt.status === 'failed').length,
        }))
        .filter((entry) => entry.retryCount > 0 || entry.failedAttempts > 0),
    }),
  }, operation);
}

export {
  tokenUsageFromCompletion,
  traceAiExecutionFlow,
  traceAgentPlanning,
  traceAgentOrchestration,
  traceAgentToolSequence,
  traceBirdIdentificationFinalResponse,
  traceBirdIdentificationPipeline,
  traceBirdIdentificationRagRetrieval,
  traceCacheOperation,
  traceContextAssembly,
  traceConversationContext,
  traceImageInput,
  traceLlmCall,
  traceRagPipeline,
  traceRagRetrieval,
  traceToolExecution,
  withAiTrace,
};
