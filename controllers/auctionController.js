const asyncHandler = require('express-async-handler');
const Property = require('../models/Property');
const Bid = require('../models/Bid');
const Conversation = require('../models/Conversation');
const ActivityLog = require('../models/ActivityLog');
const { successResponse } = require('../utils/apiResponse');
const { sendAuctionWonEmail, sendDealClosedEmail } = require('../utils/emailService');
const User = require('../models/User');

// Helper for Real-time Logging
const logActivity = async (req, user, action, property = null) => {
  try {
    const log = await ActivityLog.create({ user, action, property });
    const io = req.app.get('io');
    if (io) {
      io.emit('new_activity', log);
    }
  } catch (error) {
    console.error('Failed to create activity log', error);
  }
};

// @desc   Get all live auctions (APPROVED + isAuction=true + not ended)
// @route  GET /api/auctions
// @access Public
const getLiveAuctions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const skip = (page - 1) * limit;
  const now = new Date();

  const filter = {
    status: 'APPROVED',
    isAuction: true,
    auctionEndTime: { $gt: now },
    auctionStartTime: { $lte: now },
  };

  const [auctions, total] = await Promise.all([
    Property.find(filter)
      .populate('owner', 'name')
      .populate('highestBidder', 'name')
      .sort({ auctionEndTime: 1 })
      .skip(skip)
      .limit(limit),
    Property.countDocuments(filter),
  ]);

  return successResponse(res, {
    auctions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// @desc   Place a bid on an auction property
// @route  POST /api/auctions/:id/bid
// @access Protected (User, notBanned)
const placeBid = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const property = await Property.findById(req.params.id);

  if (!property) {
    res.status(404);
    throw new Error('Property not found');
  }
  if (!property.isAuction || property.status !== 'APPROVED') {
    res.status(400);
    throw new Error('This property is not open for bidding');
  }

  const now = new Date();

  if (now < property.auctionStartTime) {
    res.status(400);
    throw new Error('Auction has not started yet');
  }
  if (now > property.auctionEndTime) {
    res.status(400);
    throw new Error('Auction has already ended');
  }
  if (property.owner.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error('You cannot bid on your own property');
  }

  const minRequired = (property.currentHighestBid || property.basePrice) + (property.minBidIncrement || 0);
  if (Number(amount) < minRequired) {
    res.status(400);
    throw new Error(
      `Bid must be at least $${minRequired.toLocaleString()} (current highest + minimum increment)`
    );
  }

  // ── Auto-extend by 2 mins if bid placed in last 30 seconds ──
  const timeLeft = (property.auctionEndTime - now) / 1000;
  if (timeLeft <= 30) {
    property.auctionEndTime = new Date(property.auctionEndTime.getTime() + 2 * 60 * 1000);
  }

  property.currentHighestBid = Number(amount);
  property.highestBidder = req.user._id;
  await property.save();

  const bid = await Bid.create({
    property: property._id,
    bidder: req.user._id,
    amount: Number(amount),
  });

  const populatedBid = await bid.populate('bidder', 'name email');

  // Emit real-time update via Socket.io (attached to req.app)
  const io = req.app.get('io');
  if (io) {
    const recentBids = await Bid.find({ property: property._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('bidder', 'name');

    io.to(`property-${property._id}`).emit('bid-update', {
      propertyId: property._id,
      currentHighestBid: property.currentHighestBid,
      highestBidder: { _id: req.user._id, name: req.user.name },
      auctionEndTime: property.auctionEndTime,
      recentBids,
    });
  }

  // Log activity
  await logActivity(req, req.user.name, `Placed a bid (₹${Number(amount).toLocaleString()})`, property.title);

  return successResponse(res, { bid: populatedBid, property }, 'Bid placed successfully', 201);
});

// @desc   Get bid history for a property
// @route  GET /api/auctions/:id/bids
// @access Public
const getBidHistory = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [bids, total] = await Promise.all([
    Bid.find({ property: req.params.id })
      .populate('bidder', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Bid.countDocuments({ property: req.params.id }),
  ]);

  return successResponse(res, { bids, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// @desc   Get user's bid history
// @route  GET /api/auctions/my-bids
// @access Protected
const getMyBids = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [bids, total] = await Promise.all([
    Bid.find({ bidder: req.user._id })
      .populate('property', 'title images currentHighestBid highestBidder auctionEndTime status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Bid.countDocuments({ bidder: req.user._id }),
  ]);

  return successResponse(res, { bids, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// @desc   Owner accepts or rejects highest bidder
// @route  POST /api/auctions/:id/close
// @access Protected (Owner)
const closeDeal = asyncHandler(async (req, res) => {
  const { action } = req.body; // 'accept' | 'reject'
  const property = await Property.findById(req.params.id)
    .populate('owner', 'name email phone')
    .populate('highestBidder', 'name email phone');

  if (!property) {
    res.status(404);
    throw new Error('Property not found');
  }
  if (property.owner._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Only the property owner can close this deal');
  }
  if (!property.highestBidder) {
    res.status(400);
    throw new Error('No bids have been placed on this property');
  }
  if (property.dealStatus !== 'NONE') {
    res.status(400);
    throw new Error('Deal has already been closed');
  }

  const now = new Date();
  if (now < property.auctionEndTime) {
    res.status(400);
    throw new Error('Auction has not ended yet');
  }

  if (action === 'accept') {
    property.dealStatus = 'ACCEPTED';
    property.status = 'SOLD';

    // Auto-create a conversation between seller and winning buyer
    const existingConvo = await Conversation.findOne({
      property: property._id,
      buyer: property.highestBidder._id,
    });
    if (!existingConvo) {
      await Conversation.create({
        property: property._id,
        buyer: property.highestBidder._id,
        seller: property.owner._id,
        lastMessage: '🎉 Deal accepted! You can now chat about the property.',
        lastMessageAt: new Date(),
      });
    }

    // Notify parties
    sendDealClosedEmail(property.owner, property.highestBidder, property, true).catch(console.error);
  } else {
    property.dealStatus = 'REJECTED';
    sendDealClosedEmail(property.owner, property.highestBidder, property, false).catch(console.error);
  }

  await property.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`property-${property._id}`).emit('auction-ended', {
      propertyId: property._id,
      dealStatus: property.dealStatus,
      status: property.status,
    });
  }

  return successResponse(res, property, `Deal ${action === 'accept' ? 'accepted' : 'rejected'} successfully`);
});

module.exports = { getLiveAuctions, placeBid, getBidHistory, getMyBids, closeDeal };
