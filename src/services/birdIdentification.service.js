import birdIdentificationAgent, {
  BIRD_IDENTIFICATION_PROMPT_VERSION,
  BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
} from '../ai/agents/birdIdentification.agent.js';
import birdImageAnalysisService from './birdImageAnalysis.service.js';
import birdIdentificationImageStorage from './birdIdentificationImageStorage.service.js';
import { routeModel } from '../ai/routing/modelRouter.js';
import {
  traceBirdIdentificationFinalResponse,
  traceBirdIdentificationPipeline,
  traceImageInput,
} from '../tracing/aiTracing.middleware.js';
import logger from '../utils/logger.js';
import { getCompletionUsageSummary } from '../ai/telemetry/tokenUsage.js';
import usageService, { buildModelUsageEntry } from './usage.service.js';
import {
  calibrateIdentificationResult as enforceConfidenceStatus,
  normalizeConfidence,
} from './birdIdentification/calibration.js';
import {
  buildBirdKnowledgeQuery,
  normalizeBirdKnowledge,
  normalizeEnrichedCandidates,
  retrieveBirdEvidence as retrieveBirdKnowledge,
} from './birdIdentification/evidenceRetrieval.js';
import {
  normalizeBirdIdentification,
  parseBirdProviderJson as parseProviderJson,
} from './birdIdentification/candidateGeneration.js';
import {
  buildFallbackVerification,
  normalizeBirdVerification,
} from './birdIdentification/reranking.js';
import {
  assembleBirdIdentificationResponse as buildFinalIdentificationResponse,
  buildEnrichedSummary,
  buildIdentificationImageAnalysis,
  normalizePrediction,
  normalizeRagTrace,
  normalizeUserId,
  recordBirdIdentificationHistory,
} from './birdIdentification/responseAssembly.js';

const BIRD_IDENTIFICATION_MODEL = routeModel({
  task: 'bird_image_analysis',
}).primaryModel.modelId;

function addIdentificationUsage(metadata = {}, response) {
  if (!metadata || typeof metadata !== 'object') {
    return;
  }

  const usage = getCompletionUsageSummary(response);
  const current = metadata.identificationUsage || {
    totalTokens: 0,
    estimatedCostUsd: 0,
    hasEstimatedCost: false,
    modelUsage: [],
  };
  const model = response?.model || BIRD_IDENTIFICATION_MODEL;
  const modelUsage = [...(current.modelUsage || [])];
  const existingModelUsage = modelUsage.find((entry) => entry.model === model);
  const nextModelUsage = buildModelUsageEntry(model, {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
  });

  if (existingModelUsage) {
    existingModelUsage.promptTokens += nextModelUsage.promptTokens;
    existingModelUsage.completionTokens += nextModelUsage.completionTokens;
    existingModelUsage.totalTokens += nextModelUsage.totalTokens;
    existingModelUsage.estimatedCostUsd = Number((
      Number(existingModelUsage.estimatedCostUsd || 0) + Number(nextModelUsage.estimatedCostUsd || 0)
    ).toFixed(6));
  } else {
    modelUsage.push(nextModelUsage);
  }

  metadata.identificationUsage = {
    totalTokens: current.totalTokens + usage.totalTokens,
    estimatedCostUsd: Number((current.estimatedCostUsd + (usage.estimatedCostUsd || 0)).toFixed(6)),
    hasEstimatedCost: current.hasEstimatedCost || usage.estimatedCostUsd !== null,
    modelUsage,
  };
}

async function traceImageInputBoundary({ imageUrl, metadata = {}, userId }) {
  return traceImageInput('bird_identification_image_input', {
    ...metadata,
    hasImageUrl: Boolean(imageUrl),
    imageUrlLength: typeof imageUrl === 'string' ? imageUrl.length : 0,
    userIdPresent: userId !== undefined && userId !== null,
  }, async () => ({
    hasImageUrl: Boolean(imageUrl),
    imageUrlLength: typeof imageUrl === 'string' ? imageUrl.length : 0,
    userIdPresent: userId !== undefined && userId !== null,
  }));
}

class BirdIdentificationService {
  async identifyFromInput({ imageUrl, imageUpload, metadata = {}, userId }) {
    if (imageUpload?.buffer?.length) {
      const storedImage = await birdIdentificationImageStorage.uploadIdentificationImage({
        imageUpload,
        userId,
      });

      return this.identifyFromImage({
        imageUrl: storedImage.imageUrl,
        metadata: {
          ...metadata,
          imageUploadKey: storedImage.key,
          imageUploadMimeType: imageUpload.mimeType,
          imageUploadBytes: imageUpload.buffer.length,
        },
        userId,
      });
    }

    return this.identifyFromImage({ imageUrl, metadata, userId });
  }

  async identify({ imageAnalysis, imageUrl, metadata = {} }) {
    const response = await birdIdentificationAgent.identify({
      imageAnalysis,
      imageUrl,
      metadata,
    });
    addIdentificationUsage(metadata, response);
    const identification = normalizeBirdIdentification({
      ...parseProviderJson(response),
      imageAnalysis,
    });

    logger.info('Bird identification finished', {
      event: 'bird_identification',
      model: response.model || BIRD_IDENTIFICATION_MODEL,
      requestId: response.id,
      promptVersion: BIRD_IDENTIFICATION_PROMPT_VERSION,
      candidateCount: identification.candidates.length,
      topConfidence: identification.candidates[0]?.confidence,
      status: identification.status,
    });

    return {
      ...identification,
      promptVersion: BIRD_IDENTIFICATION_PROMPT_VERSION,
      model: response.model || BIRD_IDENTIFICATION_MODEL,
      providerRequestId: response.id,
    };
  }

  async verifyAndRerankBirdCandidates({ imageAnalysis, candidates, retrievedProfiles, metadata = {} }) {
    let providerRequestId;

    try {
      let response;
      let verification;

      for (let malformedAttempt = 0; malformedAttempt < 2; malformedAttempt += 1) {
        response = await birdIdentificationAgent.verifyAndRerank({
          imageAnalysis,
          candidates,
          retrievedProfiles,
          metadata,
        });
        providerRequestId = response?.id;
        addIdentificationUsage(metadata, response);

        try {
          verification = normalizeBirdVerification(parseProviderJson(response), {
            imageAnalysis,
            fallbackCandidates: candidates,
          });
          break;
        } catch (error) {
          const retryableMalformedContent = error.code === 'provider_malformed_response'
            && ['empty_content', 'invalid_json'].includes(error.failureStage);

          if (!retryableMalformedContent || malformedAttempt === 1) {
            throw error;
          }

          logger.warn('Bird verification provider content was malformed; retrying once', {
            event: 'bird_identification_verification_malformed_retry',
            errorCode: error.code,
            failureStage: error.failureStage,
            providerRequestId,
          });
        }
      }

      logger.info('Bird identification verification finished', {
        event: 'bird_identification_verification',
        model: response.model || BIRD_IDENTIFICATION_MODEL,
        requestId: response.id,
        promptVersion: BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
        candidateCount: verification.candidates.length,
        topConfidence: verification.bestMatch?.confidence,
        status: verification.status,
      });

      return {
        ...verification,
        promptVersion: BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
        model: response.model || BIRD_IDENTIFICATION_MODEL,
        providerRequestId: response.id,
      };
    } catch (error) {
      logger.warn('Bird identification verification failed; using calibrated fallback', {
        event: 'bird_identification_verification_failed',
        errorName: error.name,
        errorCode: error.code,
        failureStage: error.failureStage,
        providerRequestId,
        status: error.status,
      });

      return buildFallbackVerification({
        imageAnalysis,
        identification: {
          candidates,
          status: enforceConfidenceStatus(candidates, 'identified').status,
        },
        birdKnowledge: retrievedProfiles,
      });
    }
  }

  async identifyFromImage({ imageUrl, metadata = {}, userId }) {
    return traceBirdIdentificationPipeline('bird_identification_multimodal_pipeline', {
      ...metadata,
      hasImageUrl: Boolean(imageUrl),
      imageUrlLength: typeof imageUrl === 'string' ? imageUrl.length : 0,
      userIdPresent: userId !== undefined && userId !== null,
    }, (trace) => this.identifyFromImageUntraced({
      imageUrl,
      userId,
      metadata: {
        ...metadata,
        userId,
        parentTraceId: trace.id,
      },
    }), {
      traceId: metadata.aiTraceId,
    });
  }

  async identifyFromImageUntraced({ imageUrl, metadata = {}, userId }) {
    await traceImageInputBoundary({ imageUrl, metadata, userId });

    const imageAnalysis = await birdImageAnalysisService.analyze({
      imageUrl,
      metadata,
    });
    const identificationImageAnalysis = buildIdentificationImageAnalysis(imageAnalysis);
    const identification = await this.identify({
      imageAnalysis: identificationImageAnalysis,
      imageUrl,
      metadata,
    });
    const birdKnowledge = await retrieveBirdKnowledge({
      imageAnalysis: identificationImageAnalysis,
      identification,
      metadata,
    });
    const normalizedBirdKnowledge = normalizeBirdKnowledge(birdKnowledge);
    const verification = await this.verifyAndRerankBirdCandidates({
      imageAnalysis: identificationImageAnalysis,
      candidates: identification.candidates,
      retrievedProfiles: normalizedBirdKnowledge,
      metadata,
    });

    await usageService.updateReservedUsageEvent({
      usageEventId: metadata.usageEventId,
      userId,
      tokens: metadata.identificationUsage?.totalTokens,
      estimatedCost: metadata.identificationUsage?.hasEstimatedCost
        ? metadata.identificationUsage.estimatedCostUsd
        : null,
      traceId: metadata.parentTraceId,
      modelUsage: metadata.identificationUsage?.modelUsage,
    });

    return traceBirdIdentificationFinalResponse('bird_identification_final_response', {
      ...metadata,
      model: verification.model || identification.model,
      candidateCount: verification.candidates?.length || 0,
      topCandidate: verification.bestMatch?.commonName || verification.candidates?.[0]?.commonName,
      topConfidence: verification.bestMatch?.confidence || verification.candidates?.[0]?.confidence,
      retrievedChunkCount: birdKnowledge.ragTrace?.retrievedChunkCount,
      sourceCount: birdKnowledge.sources?.length || 0,
      promptVersions: {
        birdImageAnalysis: imageAnalysis.promptVersion,
        birdIdentification: identification.promptVersion,
        birdVerification: verification.promptVersion,
      },
    }, () => buildFinalIdentificationResponse({
      imageAnalysis,
      identification,
      verification,
      birdKnowledge,
      imageUrl,
      metadata,
      userId,
    }));
  }
}

export {
  buildBirdKnowledgeQuery,
  buildEnrichedSummary,
  buildIdentificationImageAnalysis,
  normalizeBirdIdentification,
  normalizeBirdKnowledge,
  normalizeBirdVerification,
  normalizeEnrichedCandidates,
  normalizeConfidence,
  normalizePrediction,
  normalizeRagTrace,
  normalizeUserId,
  recordBirdIdentificationHistory,
};
export default new BirdIdentificationService();
