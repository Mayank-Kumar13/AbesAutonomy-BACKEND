import { Router } from 'express';
import {
  getPremiumAnalytics,
  getPremiumUsers,
  getUserSubscriptionDetails,
  manualActivateSubscription,
  manualExtendSubscription,
  manualRevokeSubscription,
  getAdminPaymentHistory,
  getAdminAuditLogs,
  getAdminNotifications,
  markNotificationRead,
} from '../controllers/adminPremiumController.js';
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponRedemptions,
} from '../controllers/adminCouponController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

router.get('/analytics', getPremiumAnalytics);
router.get('/users', getPremiumUsers);
router.get('/users/:id/details', getUserSubscriptionDetails);
router.post('/users/:id/manual-activate', manualActivateSubscription);
router.post('/users/:id/extend', manualExtendSubscription);
router.post('/users/:id/revoke', manualRevokeSubscription);
router.get('/payments', getAdminPaymentHistory);
router.get('/audit-logs', getAdminAuditLogs);
router.get('/notifications', getAdminNotifications);
router.post('/notifications/mark-read', markNotificationRead);

// Coupon management
router.get('/coupons', listCoupons);
router.post('/coupons', createCoupon);
router.patch('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);
router.get('/coupons/:id/redemptions', getCouponRedemptions);

export default router;
