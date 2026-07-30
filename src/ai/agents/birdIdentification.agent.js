import openaiClient from '../clients/openai.client.js';
import { isRetryableOpenAIError } from '../utils/openaiRetry.utils.js';
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
import { asyncRetry } from '../../utils/async.utils.js';
import { routeModel } from '../routing/modelRouter.js';

class BirdIdentificationAgent {
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

  async identify({ imageAnalysis, imageUrl, metadata = {} }) {
    const modelRoute = routeModel({ task: 'bird_image_analysis' });
    const model = modelRoute.primaryModel.modelId;
    return traceLlmCall('bird_identification_agent', {
      model,
      promptVersion: BIRD_IDENTIFICATION_PROMPT_VERSION,
      parentTraceId: metadata.parentTraceId,
      cacheStatus: 'not_applicable',
      hasImageUrl: Boolean(imageUrl),
    }, () => asyncRetry(() => openaiClient.client.chat.completions.create({
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
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    }), {
      tokenUsage: null,
      outputMetadata: (result) => ({
        requestId: result.id,
        model: result.model || model,
      }),
    });
  }

  async verifyAndRerank({ imageAnalysis, candidates, retrievedProfiles, metadata = {} }) {
    const modelRoute = routeModel({ task: 'bird_image_analysis' });
    const model = modelRoute.primaryModel.modelId;
    return traceLlmCall('bird_identification_verification', {
      model,
      promptVersion: BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
      parentTraceId: metadata.parentTraceId,
      ragUsed: Array.isArray(retrievedProfiles) && retrievedProfiles.length > 0,
      cacheStatus: 'not_applicable',
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
      retrievedProfileCount: Array.isArray(retrievedProfiles) ? retrievedProfiles.length : 0,
    }, () => asyncRetry(() => openaiClient.client.chat.completions.create({
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
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    }), {
      tokenUsage: null,
      outputMetadata: (result) => ({
        requestId: result.id,
        model: result.model || model,
      }),
    });
  }
}

export {
  BIRD_IDENTIFICATION_PROMPT_VERSION,
  BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
};
export default new BirdIdentificationAgent();
