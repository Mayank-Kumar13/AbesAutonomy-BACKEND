import { Router } from 'express';
import {
  getPlans,
  validateCouponHandler,
  createOrderHandler,
  verifyPaymentHandler,
  webhookHandler,
  getUserSubscriptionStatus,
} from '../controllers/paymentController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/plans', getPlans);
router.post('/validate-coupon', optionalAuth, validateCouponHandler);
router.post('/create-order', requireAuth, createOrderHandler);
router.post('/verify', requireAuth, verifyPaymentHandler);
router.post('/webhook', webhookHandler);
router.get('/subscription-status', requireAuth, getUserSubscriptionStatus);

export default router;
