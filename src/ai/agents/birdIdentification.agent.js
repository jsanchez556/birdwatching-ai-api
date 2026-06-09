import openaiClient from '../openai.client.js';
import { isRetryableOpenAIError } from '../openaiRetry.js';
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
import env from '../../config/env.js';
import { traceLlmCall } from '../../tracing/aiTracing.middleware.js';
import { asyncRetry } from '../../utils/async.utils.js';

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
    return traceLlmCall('bird_identification_agent', {
      model: env.openAiModel,
      promptVersion: BIRD_IDENTIFICATION_PROMPT_VERSION,
      parentTraceId: metadata.parentTraceId,
      hasImageUrl: Boolean(imageUrl),
    }, () => asyncRetry(() => openaiClient.client.chat.completions.create({
      model: env.openAiModel,
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
        model: result.model || env.openAiModel,
      }),
    });
  }

  async verifyAndRerank({ imageAnalysis, candidates, retrievedProfiles, metadata = {} }) {
    return traceLlmCall('bird_identification_verification', {
      model: env.openAiModel,
      promptVersion: BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
      parentTraceId: metadata.parentTraceId,
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
      retrievedProfileCount: Array.isArray(retrievedProfiles) ? retrievedProfiles.length : 0,
    }, () => asyncRetry(() => openaiClient.client.chat.completions.create({
      model: env.openAiModel,
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
        model: result.model || env.openAiModel,
      }),
    });
  }
}

export {
  BIRD_IDENTIFICATION_PROMPT_VERSION,
  BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION,
};
export default new BirdIdentificationAgent();
