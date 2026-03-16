const asyncHandler = require('express-async-handler');
const Property = require('../models/Property');
const ActivityLog = require('../models/ActivityLog');
const { successResponse } = require('../utils/apiResponse');
const { uploadMultipleToCloudinary } = require('../middleware/upload');

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

// ─── Helper: build query from filters ────────────────────────
const buildPropertyQuery = (query) => {
  const filter = { status: 'APPROVED' };

  if (query.propertyType) filter.propertyType = query.propertyType;
  if (query.location) filter.location = { $regex: query.location, $options: 'i' };
  if (query.minPrice || query.maxPrice) {
    filter.basePrice = {};
    if (query.minPrice) filter.basePrice.$gte = Number(query.minPrice);
    if (query.maxPrice) filter.basePrice.$lte = Number(query.maxPrice);
  }
  if (query.search) {
    filter.$or = [
      { title: { $regex: query.search, $options: 'i' } },
      { description: { $regex: query.search, $options: 'i' } },
      { location: { $regex: query.search, $options: 'i' } },
    ];
  }
  return filter;
};

// @desc   Get all APPROVED properties (with filters & pagination)
// @route  GET /api/properties
// @access Public
const getProperties = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 6;
  const skip = (page - 1) * limit;
  const sortBy = req.query.sortBy || 'createdAt';
  const order = req.query.order === 'asc' ? 1 : -1;

  const filter = buildPropertyQuery(req.query);
  if (req.query.isAuction !== undefined) filter.isAuction = req.query.isAuction === 'true';

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .populate('owner', 'name email')
      .populate('highestBidder', 'name')
      .sort({ [sortBy]: order })
      .skip(skip)
      .limit(limit),
    Property.countDocuments(filter),
  ]);

  return successResponse(res, {
    properties,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc   Get single property by ID
// @route  GET /api/properties/:id
// @access Public
const getPropertyById = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id)
    .populate('owner', 'name email phone')
    .populate('highestBidder', 'name email');

  if (!property) {
    res.status(404);
    throw new Error('Property not found');
  }

  return successResponse(res, property);
});

// @desc   Create new property listing
// @route  POST /api/properties
// @access Protected (User)
const createProperty = asyncHandler(async (req, res) => {
  const {
    title, description, location, propertyType, basePrice,
    isAuction, minBidIncrement, auctionStartTime, auctionEndTime,
  } = req.body;

  let images = [];
  if (req.files && req.files.length > 0) {
    images = await uploadMultipleToCloudinary(req.files, 'realestate/properties');
  }

  const property = await Property.create({
    owner: req.user._id,
    title,
    description,
    location,
    propertyType,
    basePrice: Number(basePrice),
    images,
    isAuction: isAuction === 'true' || isAuction === true,
    minBidIncrement: Number(minBidIncrement) || 0,
    auctionStartTime: auctionStartTime || null,
    auctionEndTime: auctionEndTime || null,
    currentHighestBid: Number(basePrice),
    status: 'PENDING',
  });

  // Log activity
  await logActivity(req, req.user.name, 'Listed a property', property.title);

  return successResponse(res, property, 'Property submitted for review. Pending admin approval.', 201);
});

// @desc   Update property (owner only)
// @route  PUT /api/properties/:id
// @access Protected (Owner)
const updateProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    res.status(404);
    throw new Error('Property not found');
  }

  if (property.owner.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this property');
  }

  if (property.status === 'SOLD') {
    res.status(400);
    throw new Error('Cannot edit a sold property');
  }

  const updatable = ['title', 'description', 'location', 'propertyType', 'basePrice'];
  updatable.forEach((field) => {
    if (req.body[field] !== undefined) property[field] = req.body[field];
  });

  property.status = 'PENDING'; // re-review needed after edit
  const updated = await property.save();
  return successResponse(res, updated, 'Property updated. Pending admin re-approval.');
});

// @desc   Delete property (owner or admin)
// @route  DELETE /api/properties/:id
// @access Protected
const deleteProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) {
    res.status(404);
    throw new Error('Property not found');
  }

  const isOwner = property.owner.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this property');
  }

  await property.deleteOne();
  return successResponse(res, null, 'Property deleted successfully');
});

// @desc   Get owner's own listings
// @route  GET /api/properties/my-listings
// @access Protected
const getMyListings = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const skip = (page - 1) * limit;

  const [properties, total] = await Promise.all([
    Property.find({ owner: req.user._id })
      .populate('highestBidder', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Property.countDocuments({ owner: req.user._id }),
  ]);

  return successResponse(res, {
    properties,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = {
  getProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  getMyListings,
};
