import {
  signAuthToken,
  verifyAuthToken,
} from '../src/utils/authTokens.js';

describe('auth token feature flag targeting', () => {
  it('preserves the internal plan for server-side flag evaluation', () => {
    const token = signAuthToken({
      id: 7,
      email: 'person@example.test',
      role: 'customer',
      plan: 'PRO',
    });

    expect(verifyAuthToken(token)).toEqual(expect.objectContaining({
      id: '7',
      role: 'customer',
      plan: 'PRO',
    }));
  });
});
