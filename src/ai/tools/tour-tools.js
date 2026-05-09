import reservationService from '../../services/reservation.service.js';
import tourService from '../../services/tour.service.js';

export async function getAvailableTours(args = {}) {
  return tourService.getAvailableTours(args);
}

export async function recommendTours(args = {}) {
  return tourService.recommendTours(args);
}

export async function selectTour(args = {}) {
  return tourService.selectTour(args);
}

export async function checkTourAvailability(args = {}) {
  return reservationService.checkTourAvailability(args);
}

export async function calculateTourPrice(args = {}) {
  return reservationService.calculateTourPrice(args);
}

export async function createReservation(args = {}, metadata = {}) {
  return reservationService.createReservation(args, metadata);
}

export const tourToolHandlers = {
  getAvailableTours,
  recommendTours,
  selectTour,
  checkTourAvailability,
  calculateTourPrice,
  createReservation,
};
