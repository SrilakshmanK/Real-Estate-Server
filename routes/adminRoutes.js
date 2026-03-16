const express = require('express');
const router = express.Router();
const {
  getStats, getActivityLogs, getAllProperties, approveProperty, rejectProperty,
  getAllUsers, toggleBanUser, getAllBids, overrideAuction,
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

router.get('/stats', getStats);
router.get('/activity', getActivityLogs);

// Properties
router.get('/properties', getAllProperties);
router.patch('/properties/:id/approve', approveProperty);
router.patch('/properties/:id/reject', rejectProperty);

// Users
router.get('/users', getAllUsers);
router.patch('/users/:id/ban', toggleBanUser);

// Bids
router.get('/bids', getAllBids);

// Auctions
router.patch('/auctions/:id/override', overrideAuction);

module.exports = router;
