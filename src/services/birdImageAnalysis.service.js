import openaiClient from '../ai/clients/openai.client.js';
import { executeOpenAIWithRetry } from '../ai/utils/openaiRetry.utils.js';
import {
  BIRD_IMAGE_ANALYSIS_PROMPT_VERSION,
  BIRD_IMAGE_ANALYSIS_SYSTEM_PROMPT,
} from '../ai/prompts/birdImageAnalysis.prompt.js';
import { BIRD_IMAGE_ANALYSIS_RESPONSE_SCHEMA } from '../ai/schemas/birdImageAnalysis.schema.js';
import { traceLlmCall } from '../tracing/aiTracing.middleware.js';
import { routeModel } from '../ai/routing/modelRouter.js';
import HttpError from '../utils/httpError.js';
import logger from '../utils/logger.js';
import { getCompletionUsageSummary } from '../ai/telemetry/tokenUsage.js';
import usageService, { USAGE_FEATURES, buildModelUsageEntry } from './usage.service.js';

const DEFAULT_IMAGE_ANALYSIS = {
  dominantColors: [],
  fieldMarks: [],
  bill: {
    color: 'unknown',
    shape: 'unknown',
    length: 'unknown',
  },
  head: 'unknown',
  throat: 'unknown',
  underparts: 'unknown',
  upperparts: 'unknown',
  wings: 'unknown',
  tail: 'unknown',
  legs: 'unknown',
  bodyShape: 'unknown',
  apparentGroup: 'unknown',
  habitatHint: 'unknown',
  imageQuality: 'unknown',
  confidence: 0,
};

function normalizeText(value, fallback = 'unknown') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeStringList(values, maxItems) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => normalizeText(value, ''))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeConfidence(value) {
  const confidence = Number(value);

  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new HttpError(502, 'Image analysis provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }

  return confidence;
}

function normalizeBill(rawBill = {}, legacyBeak) {
  const bill = rawBill && typeof rawBill === 'object' && !Array.isArray(rawBill) ? rawBill : {};

  return {
    color: normalizeText(bill.color || legacyBeak),
    shape: normalizeText(bill.shape),
    length: normalizeText(bill.length),
  };
}

export function normalizeBirdImageAnalysis(rawAnalysis) {
  if (!rawAnalysis || typeof rawAnalysis !== 'object' || Array.isArray(rawAnalysis)) {
    throw new HttpError(502, 'Image analysis provider returned an invalid response.', {
      code: 'provider_malformed_response',
    });
  }

  const confidence = normalizeConfidence(rawAnalysis.confidence ?? DEFAULT_IMAGE_ANALYSIS.confidence);
  const dominantColors = normalizeStringList(
    rawAnalysis.dominantColors || rawAnalysis.colors,
    8
  );
  const fieldMarks = normalizeStringList(rawAnalysis.fieldMarks, 12);
  const bill = normalizeBill(rawAnalysis.bill, rawAnalysis.beak);

  return {
    dominantColors,
    fieldMarks,
    bill,
    head: normalizeText(rawAnalysis.head || rawAnalysis.headPattern),
    throat: normalizeText(rawAnalysis.throat),
    underparts: normalizeText(rawAnalysis.underparts || rawAnalysis.bellyColor),
    upperparts: normalizeText(rawAnalysis.upperparts),
    wings: normalizeText(rawAnalysis.wings || rawAnalysis.wingPattern),
    tail: normalizeText(rawAnalysis.tail),
    legs: normalizeText(rawAnalysis.legs),
    bodyShape: normalizeText(rawAnalysis.bodyShape || rawAnalysis.size),
    apparentGroup: normalizeText(rawAnalysis.apparentGroup),
    habitatHint: normalizeText(rawAnalysis.habitatHint),
    imageQuality: normalizeText(rawAnalysis.imageQuality),
    confidence,
    colors: dominantColors.slice(0, 3),
    beak: bill.color,
    size: normalizeText(rawAnalysis.size || rawAnalysis.bodyShape),
    wingPattern: normalizeText(rawAnalysis.wingPattern || rawAnalysis.wings),
    headPattern: normalizeText(rawAnalysis.headPattern || rawAnalysis.head),
    bellyColor: normalizeText(rawAnalysis.bellyColor || rawAnalysis.underparts),
  };
}

class BirdImageAnalysisService {
  async analyze({ imageUrl, metadata = {} }) {
    const modelRoute = routeModel({ task: 'bird_image_analysis' });
    const model = modelRoute.primaryModel.modelId;
    const response = await traceLlmCall('bird_image_analysis', {
      model,
      promptVersion: BIRD_IMAGE_ANALYSIS_PROMPT_VERSION,
      parentTraceId: metadata.parentTraceId,
      cacheStatus: 'not_applicable',
    }, () => executeOpenAIWithRetry(() => (
      openaiClient.client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: BIRD_IMAGE_ANALYSIS_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe the visible bird characteristics in this image.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'bird_image_analysis',
            strict: true,
            schema: BIRD_IMAGE_ANALYSIS_RESPONSE_SCHEMA,
          },
        },
      })
    ), {
      operation: 'bird_image_analysis',
    }), {
      tokenUsage: null,
      outputMetadata: (result) => ({
        requestId: result.id,
        model: result.model || model,
      }),
    });

    const rawContent = response.choices?.[0]?.message?.content;

    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      throw new HttpError(502, 'Image analysis provider returned an empty response.', {
        code: 'provider_malformed_response',
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(rawContent);
    } catch (error) {
      logger.warn('Image analysis provider returned invalid JSON', {
        event: 'bird_image_analysis_parse_failed',
        model: response.model || model,
        requestId: response.id,
      });
      throw new HttpError(502, 'Image analysis provider returned an invalid response.', {
        code: 'provider_malformed_response',
      });
    }

    const analysis = normalizeBirdImageAnalysis(parsed);

    logger.info('Bird image analysis finished', {
      event: 'bird_image_analysis',
      model: response.model || model,
      requestId: response.id,
      promptVersion: BIRD_IMAGE_ANALYSIS_PROMPT_VERSION,
      colorCount: analysis.dominantColors.length,
      fieldMarkCount: analysis.fieldMarks.length,
      confidence: analysis.confidence,
    });

    const usage = getCompletionUsageSummary(response);
    await usageService.recordUsageEvent({
      userId: metadata.userId,
      feature: USAGE_FEATURES.IMAGE_ANALYSIS,
      tokens: usage.totalTokens,
      estimatedCost: usage.estimatedCostUsd,
      traceId: metadata.parentTraceId,
      modelUsage: [
        buildModelUsageEntry(response.model || model, {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd: usage.estimatedCostUsd,
        }),
      ],
    });

    return {
      ...analysis,
      promptVersion: BIRD_IMAGE_ANALYSIS_PROMPT_VERSION,
      model: response.model || model,
      providerRequestId: response.id,
    };
  }
}

export default new BirdImageAnalysisService();
