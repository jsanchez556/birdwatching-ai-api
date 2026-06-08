import observabilityService from '../observability/observability.service.js';

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

function withAiTrace({ type, name, metadata = {}, tokenUsage, outputMetadata } = {}, operation) {
  return observabilityService.trace({
    type,
    name,
    metadata,
    parentTraceId: metadata.parentTraceId,
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

function traceAiExecutionFlow(name, metadata, operation) {
  return withAiTrace({
    type: 'ai_execution_flow',
    name,
    metadata,
    outputMetadata: (result = {}) => ({
      conversationId: result.conversationId,
      responseLength: result.response?.length || 0,
      sourceCount: result.sources?.length || 0,
      hasReservation: Boolean(result.meta?.reservation),
      toolsCalled: result.meta?.toolsCalled || [],
      promptVersions: result.meta?.promptVersions,
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
  traceConversationContext,
  traceLlmCall,
  traceRagPipeline,
  traceRagRetrieval,
  traceToolExecution,
  withAiTrace,
};
