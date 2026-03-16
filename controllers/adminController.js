const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Property = require('../models/Property');
const Bid = require('../models/Bid');
const ActivityLog = require('../models/ActivityLog');
const { successResponse } = require('../utils/apiResponse');
const { sendPropertyStatusEmail } = require('../utils/emailService');

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

// @desc   Get recent activity logs
// @route  GET /api/admin/activity
// @access Admin
const getActivityLogs = asyncHandler(async (req, res) => {
  const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(10);
  return successResponse(res, logs);
});

// @desc   Get dashboard stats
// @route  GET /api/admin/stats
// @access Admin
const getStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalProperties, pendingProperties, totalBids, activeAuctions] =
    await Promise.all([
      User.countDocuments({ role: 'user' }),
      Property.countDocuments(),
      Property.countDocuments({ status: 'PENDING' }),
      Bid.countDocuments(),
      Property.countDocuments({ isAuction: true, status: 'APPROVED', auctionEndTime: { $gt: new Date() } }),
    ]);

  return successResponse(res, {
    totalUsers,
    totalProperties,
    pendingProperties,
    totalBids,
    activeAuctions,
  });
});

// @desc   Get all properties (admin)
// @route  GET /api/admin/properties
// @access Admin
const getAllProperties = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Property.countDocuments(filter),
  ]);

  return successResponse(res, {
    properties,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// @desc   Approve a property
// @route  PATCH /api/admin/properties/:id/approve
// @access Admin
const approveProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id).populate('owner', 'name email');
  if (!property) {
    res.status(404);
    throw new Error('Property not found');
  }

  property.status = 'APPROVED';
  property.adminNote = req.body.note || '';
  await property.save();

  sendPropertyStatusEmail(property.owner, property, 'APPROVED', property.adminNote).catch(console.error);

  // Log user activity
  const adminName = req.user?.name || 'Admin';
  await logActivity(req, adminName, 'Approved property', property.title);

  return successResponse(res, property, 'Property approved successfully');
});

// @desc   Reject a property
// @route  PATCH /api/admin/properties/:id/reject
// @access Admin
const rejectProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id).populate('owner', 'name email');
  if (!property) {
    res.status(404);
    throw new Error('Property not found');
  }

  property.status = 'REJECTED';
  property.adminNote = req.body.note || '';
  await property.save();

  sendPropertyStatusEmail(property.owner, property, 'REJECTED', property.adminNote).catch(console.error);

  // Log user activity
  const adminName = req.user?.name || 'Admin';
  await logActivity(req, adminName, 'Rejected property', property.title);

  return successResponse(res, property, 'Property rejected');
});

// @desc   Get all users
// @route  GET /api/admin/users
// @access Admin
const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return successResponse(res, {
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// @desc   Toggle user ban
// @route  PATCH /api/admin/users/:id/ban
// @access Admin
const toggleBanUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (user.role === 'admin') {
    res.status(400);
    throw new Error('Cannot ban an admin account');
  }

  user.isBanned = !user.isBanned;
  await user.save();

  // Log activity
  const adminName = req.user?.name || 'Admin';
  await logActivity(req, adminName, user.isBanned ? 'Banned user' : 'Unbanned user', user.name);

  return successResponse(
    res,
    { isBanned: user.isBanned },
    `User ${user.isBanned ? 'banned' : 'unbanned'} successfully`
  );
});

// @desc   Get all bids (admin)
// @route  GET /api/admin/bids
// @access Admin
const getAllBids = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [bids, total] = await Promise.all([
    Bid.find()
      .populate('property', 'title')
      .populate('bidder', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Bid.countDocuments(),
  ]);

  return successResponse(res, {
    bids,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// @desc   Override / force close an auction
// @route  PATCH /api/admin/auctions/:id/override
// @access Admin
const overrideAuction = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    res.status(404);
    throw new Error('Property not found');
  }
  if (!property.isAuction) {
    res.status(400);
    throw new Error('Property is not an auction');
  }

  // Force end the auction now
  property.auctionEndTime = new Date();
  if (req.body.status) property.status = req.body.status;
  await property.save();

  const io = req.app.get('io');
  if (io) {
    io.to(`property-${property._id}`).emit('auction-ended', {
      propertyId: property._id,
      overriddenByAdmin: true,
    });
  }

  // Log activity
  const adminName = req.user?.name || 'Admin';
  await logActivity(req, adminName, 'Force-closed auction', property.title);


  return successResponse(res, property, 'Auction overridden by admin');
});

module.exports = {
  getStats,
  getActivityLogs,
  getAllProperties,
  approveProperty,
  rejectProperty,
  getAllUsers,
  toggleBanUser,
  getAllBids,
  overrideAuction,
};
