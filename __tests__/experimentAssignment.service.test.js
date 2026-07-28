import { jest } from '@jest/globals';
import { ExperimentAssignmentService } from '../src/services/experimentAssignment.service.js';

const experiment = {
  experiment: 'tour_recommendation_prompt',
  flag: 'tour_recommendation_prompt',
  variants: ['recommendation_prompt_v1', 'recommendation_prompt_v2'],
  defaultVariant: 'recommendation_prompt_v1',
};

describe('ExperimentAssignmentService', () => {
  it('returns an existing durable assignment without reevaluating the flag', async () => {
    const queries = {
      get: jest.fn().mockResolvedValue({
        experiment: experiment.experiment,
        variant: 'recommendation_prompt_v1',
      }),
      assign: jest.fn(),
    };
    const featureFlagService = { getVariant: jest.fn() };
    const service = new ExperimentAssignmentService({
      queries,
      featureFlagService,
    });

    await expect(service.resolve({
      userId: 7,
      ...experiment,
    })).resolves.toEqual({
      experiment: experiment.experiment,
      variant: 'recommendation_prompt_v1',
    });
    expect(featureFlagService.getVariant).not.toHaveBeenCalled();
    expect(queries.assign).not.toHaveBeenCalled();
  });

  it('evaluates once and persists the assigned variant for a user', async () => {
    const queries = {
      get: jest.fn().mockResolvedValue(null),
      assign: jest.fn().mockResolvedValue({
        experiment: experiment.experiment,
        variant: 'recommendation_prompt_v2',
      }),
    };
    const featureFlagService = {
      getVariant: jest.fn().mockResolvedValue('recommendation_prompt_v2'),
    };
    const service = new ExperimentAssignmentService({
      queries,
      featureFlagService,
    });

    await expect(service.resolve({
      userId: 7,
      personProperties: { plan: 'PRO' },
      ...experiment,
    })).resolves.toEqual({
      experiment: experiment.experiment,
      variant: 'recommendation_prompt_v2',
    });
    expect(queries.assign).toHaveBeenCalledWith({
      userId: 7,
      experiment: experiment.experiment,
      variant: 'recommendation_prompt_v2',
    });
  });

  it('falls back safely when persistence is unavailable', async () => {
    const log = { warn: jest.fn() };
    const service = new ExperimentAssignmentService({
      queries: {
        get: jest.fn().mockRejectedValue(new Error('database unavailable')),
        assign: jest.fn().mockRejectedValue(new Error('database unavailable')),
      },
      featureFlagService: {
        getVariant: jest.fn().mockResolvedValue('invalid_variant'),
      },
      log,
    });

    await expect(service.resolve({
      userId: 7,
      ...experiment,
    })).resolves.toEqual({
      experiment: experiment.experiment,
      variant: 'recommendation_prompt_v1',
    });
    expect(log.warn).toHaveBeenCalledWith(
      'Experiment assignment lookup failed',
      { experiment: experiment.experiment }
    );
    expect(log.warn).toHaveBeenCalledWith(
      'Experiment assignment persistence failed',
      { experiment: experiment.experiment }
    );
  });
});
