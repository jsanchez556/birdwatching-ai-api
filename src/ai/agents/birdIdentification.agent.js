import openaiClient from '../clients/openai.client.js';
import { executeModelRoute } from '../utils/modelRouteExecution.utils.js';
import {
  BIRD_IDENTIFICATION_PROMPT_VERSION,
  BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
  BIRD_IDENTIFICATION_VERIFICATION_SYSTEM_PROMPT,
  BIRD_CANDIDATE_GENERATION_SYSTEM_PROMPT,
} from '../prompts/birdIdentification.prompt.js';
import {
  BIRD_IDENTIFICATION_RESPONSE_SCHEMA,
  BIRD_IDENTIFICATION_VERIFICATION_RESPONSE_SCHEMA,
} from '../schemas/birdIdentification.schema.js';
import { traceLlmCall } from '../../tracing/aiTracing.middleware.js';
import { routeModel } from '../routing/modelRouter.js';

class BirdIdentificationAgent {
  constructor({
    client = openaiClient,
    modelRouter = routeModel,
    modelRouteExecutor = executeModelRoute,
  } = {}) {
    this.client = client;
    this.modelRouter = modelRouter;
    this.modelRouteExecutor = modelRouteExecutor;
  }

  buildCandidateUserContent({ imageAnalysis, imageUrl }) {
    const text = `Image analysis JSON:\n${JSON.stringify(imageAnalysis)}`;

    if (!imageUrl) {
      return text;
    }

    return [
      {
        type: 'text',
        text,
      },
      {
        type: 'image_url',
        image_url: {
          url: imageUrl,
        },
      },
    ];
  }

  async executeStructuredCompletion({
    metadata,
    traceName,
    promptVersion,
    traceMetadata,
    buildRequest,
  }) {
    const modelRoute = this.modelRouter({ task: 'bird_image_analysis' });
    metadata.modelRouting = {
      task: modelRoute.task,
      route: modelRoute.route,
      primaryModelKey: modelRoute.primaryModel.key,
      fallbackModelKeys: modelRoute.fallbackModels.map((model) => model.key),
      reasonCode: modelRoute.reasonCode,
    };
    return this.modelRouteExecutor({
      modelRoute,
      metadata,
      executeAttempt: async ({ model, signal, attemptContext }) => traceLlmCall(
        traceName,
        {
          model: model.modelId,
          promptVersion,
          parentTraceId: metadata.parentTraceId,
          cacheStatus: 'not_applicable',
          ...traceMetadata,
          modelRoutingExecutionId: metadata.modelRouting.executionId,
        },
        async () => {
          const completion = await this.client.client.chat.completions.create(
            buildRequest({ model: model.modelId }),
            { signal }
          );
          attemptContext.providerRequestId = completion.id;
          attemptContext.providerModel = completion.model || model.modelId;
          attemptContext.tokenUsage = completion.usage;
          try {
            JSON.parse(completion.choices?.[0]?.message?.content || '');
            attemptContext.schemaValidation = { success: true, errorCode: null };
          } catch {
            attemptContext.schemaValidation = { success: false, errorCode: 'invalid_json' };
            throw Object.assign(new Error('Structured model output was invalid.'), {
              code: 'provider_malformed_response',
            });
          }
          return completion;
        },
        {
          tokenUsage: null,
          outputMetadata: (result) => ({
            requestId: result.id,
            model: result.model || model.modelId,
          }),
        }
      ),
    });
  }

  async identify({ imageAnalysis, imageUrl, metadata = {} }) {
    return this.executeStructuredCompletion({
      metadata,
      traceName: 'bird_identification_agent',
      promptVersion: BIRD_IDENTIFICATION_PROMPT_VERSION,
      traceMetadata: {
        hasImageUrl: Boolean(imageUrl),
      },
      buildRequest: ({ model }) => ({
        model,
        messages: [
          {
            role: 'system',
            content: BIRD_CANDIDATE_GENERATION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: this.buildCandidateUserContent({ imageAnalysis, imageUrl }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'bird_identification',
            strict: true,
            schema: BIRD_IDENTIFICATION_RESPONSE_SCHEMA,
          },
        },
      }),
    });
  }

  async verifyAndRerank({ imageAnalysis, candidates, retrievedProfiles, metadata = {} }) {
    return this.executeStructuredCompletion({
      metadata,
      traceName: 'bird_identification_verification',
      promptVersion: BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
      traceMetadata: {
        ragUsed: Array.isArray(retrievedProfiles) && retrievedProfiles.length > 0,
        candidateCount: Array.isArray(candidates) ? candidates.length : 0,
        retrievedProfileCount: Array.isArray(retrievedProfiles) ? retrievedProfiles.length : 0,
      },
      buildRequest: ({ model }) => ({
        model,
        messages: [
          {
            role: 'system',
            content: BIRD_IDENTIFICATION_VERIFICATION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              'Visible image evidence JSON:',
              JSON.stringify(imageAnalysis),
              'Candidate species JSON:',
              JSON.stringify(candidates),
              'Retrieved bird profiles JSON:',
              JSON.stringify(retrievedProfiles),
            ].join('\n'),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'bird_identification_verification',
            strict: true,
            schema: BIRD_IDENTIFICATION_VERIFICATION_RESPONSE_SCHEMA,
          },
        },
      }),
    });
  }
}

export {
  BIRD_IDENTIFICATION_PROMPT_VERSION,
  BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
};
export default new BirdIdentificationAgent();
