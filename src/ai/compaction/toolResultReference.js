import toolResultReferenceService from '../../services/toolResultReference.service.js';
import {
  findPrimaryCollection,
  getToolResultTotal,
  shouldCompactToolResult,
} from './toolResultCompactor.js';
import { validateToolResultForContext } from '../tools/toolResultValidation.js';

function attachReference(result, referenceId, expiresAt) {
  if (!result || typeof result !== 'object' || !referenceId) return;
  Object.defineProperty(result, 'resultReferenceId', {
    value: referenceId,
    enumerable: false,
    configurable: true,
  });
  if (expiresAt) {
    Object.defineProperty(result, 'resultReferenceExpiresAt', {
      value: expiresAt,
      enumerable: false,
      configurable: true,
    });
  }
}

async function persistLargeToolResult({
  toolName,
  result,
  metadata = {},
  store = toolResultReferenceService,
  logger,
} = {}) {
  const validation = result?.contextValidation || validateToolResultForContext(toolName, result, {
    metadata,
  });
  if (validation.valid !== true || !shouldCompactToolResult(result) || !metadata.conversationId) {
    return null;
  }
  const { values } = findPrimaryCollection(result);
  const total = getToolResultTotal(result, values);
  try {
    const stored = await store.store({
      toolName,
      result,
      total,
      conversationId: metadata.conversationId,
      userId: metadata.userId,
    });
    if (!stored?.referenceId) return null;
    attachReference(result, stored.referenceId, stored.expiresAt);
    metadata.toolResultReferences = [
      ...(metadata.toolResultReferences || []),
      {
        referenceId: stored.referenceId,
        toolName,
        total,
        ...(stored.expiresAt ? { expiresAt: stored.expiresAt } : {}),
      },
    ];
    return stored;
  } catch (error) {
    logger?.warn?.('Tool result reference storage failed', {
      toolName,
      conversationId: metadata.conversationId,
      code: error.code,
    });
    return null;
  }
}

export { attachReference, persistLargeToolResult };
