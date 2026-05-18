import authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

class AuthController {
  async signup(req, res) {
    const result = await authService.signup(req.body);
    return sendSuccess(res, result, {}, 201);
  }

  async login(req, res) {
    const result = await authService.login(req.body);
    return sendSuccess(res, result);
  }

  async refresh(req, res) {
    const result = await authService.refresh(req.body);
    return sendSuccess(res, result);
  }

  async logout(req, res) {
    const result = await authService.logout(req.body);
    return sendSuccess(res, result);
  }
}

export default new AuthController();
