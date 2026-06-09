import reservationService from '../../services/reservation.service.js';

async function calculatePricing(args = {}) {
  return reservationService.calculateTourPrice(args);
}

export default calculatePricing;
