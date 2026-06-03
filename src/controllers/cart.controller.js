import cartService from '../services/cart.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

class CartController {
  async handleGetCart(req, res) {
    const cart = await cartService.getCart(req.user.id);
    return sendSuccess(res, { cart });
  }

  async handleAddItem(req, res) {
    const item = await cartService.addItem(req.user.id, req.body);
    return sendSuccess(res, { item }, {}, 201);
  }

  async handleUpdateItem(req, res) {
    const item = await cartService.updateItem(req.user.id, req.params.itemId, req.body);
    return sendSuccess(res, { item });
  }

  async handleRemoveItem(req, res) {
    const result = await cartService.removeItem(req.user.id, req.params.itemId);
    return sendSuccess(res, result);
  }

  async handleGetReservations(req, res) {
    const reservations = await cartService.getLatestReservations(req.user.id);
    return sendSuccess(res, { reservations });
  }

  async handleCreateReservations(req, res) {
    const result = await cartService.createReservations(req.user, req.body);
    return sendSuccess(res, result, {}, 201);
  }
}

export default new CartController();
