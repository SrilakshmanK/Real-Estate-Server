const express = require('express');
const router = express.Router();
const {
  getLiveAuctions, placeBid, getBidHistory, getMyBids, closeDeal,
} = require('../controllers/auctionController');
const { protect, notBanned } = require('../middleware/auth');

// Public
router.get('/', getLiveAuctions);

// Protected — specific routes MUST come before param routes
router.get('/my-bids', protect, getMyBids);

// Param routes
router.get('/:id/bids', getBidHistory);
router.post('/:id/bid', protect, notBanned, placeBid);
router.post('/:id/close', protect, closeDeal);

module.exports = router;
