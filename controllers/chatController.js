const asyncHandler = require('express-async-handler');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Property = require('../models/Property');
const { successResponse } = require('../utils/apiResponse');

// @desc   Start or retrieve an existing conversation for a property
// @route  POST /api/chat/start
// @access Protected
const startOrGetConversation = asyncHandler(async (req, res) => {
  const { propertyId } = req.body;

  const property = await Property.findById(propertyId);
  if (!property) {
    res.status(404);
    throw new Error('Property not found');
  }

  const isOwner = property.owner.toString() === req.user._id.toString();

  // Determine the buyer for this conversation
  let buyerId;

  if (isOwner) {
    // Owner can only start chat on accepted auction properties (with the winning buyer)
    if (property.isAuction && property.dealStatus === 'ACCEPTED' && property.highestBidder) {
      buyerId = property.highestBidder;
    } else {
      res.status(400);
      throw new Error('You cannot start a chat on your own property');
    }
  } else {
    buyerId = req.user._id;
  }

  // Check if conversation already exists
  let conversation = await Conversation.findOne({
    property: propertyId,
    buyer: buyerId,
  })
    .populate('property', 'title images')
    .populate('buyer', 'name email')
    .populate('seller', 'name email');

  if (!conversation) {
    conversation = await Conversation.create({
      property: propertyId,
      buyer: buyerId,
      seller: property.owner,
    });

    // Re-populate after creation
    conversation = await Conversation.findById(conversation._id)
      .populate('property', 'title images')
      .populate('buyer', 'name email')
      .populate('seller', 'name email');
  }

  return successResponse(res, conversation, 'Conversation ready');
});

// @desc   Get all conversations for logged-in user
// @route  GET /api/chat/conversations
// @access Protected
const getMyConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({
    $or: [{ buyer: req.user._id }, { seller: req.user._id }],
  })
    .populate('property', 'title images')
    .populate('buyer', 'name email')
    .populate('seller', 'name email')
    .sort({ lastMessageAt: -1 });

  return successResponse(res, conversations);
});

// @desc   Get messages for a conversation
// @route  GET /api/chat/:conversationId/messages
// @access Protected (buyer or seller in conversation)
const getMessages = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.conversationId);

  if (!conversation) {
    res.status(404);
    throw new Error('Conversation not found');
  }

  const userId = req.user._id.toString();
  if (
    conversation.buyer.toString() !== userId &&
    conversation.seller.toString() !== userId
  ) {
    res.status(403);
    throw new Error('Not authorized to view this conversation');
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  // Mark conversation as read by this user
  const updateQuery = conversation.buyer.toString() === userId
    ? { buyerUnreadCount: 0 }
    : { sellerUnreadCount: 0 };

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $addToSet: { readBy: req.user._id },
      $set: updateQuery
    }
  );

  const [messages, total] = await Promise.all([
    Message.find({ conversation: req.params.conversationId })
      .populate('sender', 'name')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit),
    Message.countDocuments({ conversation: req.params.conversationId }),
  ]);

  return successResponse(res, {
    messages,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// @desc   Send a message in a conversation
// @route  POST /api/chat/:conversationId/messages
// @access Protected (buyer or seller in conversation)
const sendMessage = asyncHandler(async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    res.status(400);
    throw new Error('Message text is required');
  }

  const conversation = await Conversation.findById(req.params.conversationId);

  if (!conversation) {
    res.status(404);
    throw new Error('Conversation not found');
  }

  const userId = req.user._id.toString();
  if (
    conversation.buyer.toString() !== userId &&
    conversation.seller.toString() !== userId
  ) {
    res.status(403);
    throw new Error('Not authorized to send messages in this conversation');
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: req.user._id,
    text: text.trim(),
  });

  // Update conversation preview + reset readBy to only the sender
  conversation.lastMessage = text.trim().substring(0, 100);
  conversation.lastMessageAt = new Date();
  conversation.readBy = [req.user._id];

  // Increment unread count for the recipient
  if (conversation.buyer.toString() === userId) {
    conversation.sellerUnreadCount += 1;
  } else {
    conversation.buyerUnreadCount += 1;
  }

  await conversation.save();

  const populatedMessage = await message.populate('sender', 'name');

  // Emit real-time event to the chat room (for users currently viewing this chat)
  const io = req.app.get('io');
  if (io) {
    const messagePayload = {
      conversationId: conversation._id.toString(),
      message: populatedMessage,
    };

    // 1. Broadcast to the chat room (anyone with the chat open)
    io.to(`chat-${conversation._id}`).emit('new-message', messagePayload);

    // 2. Also notify the OTHER user's personal room (for navbar badge)
    const recipientId = conversation.buyer.toString() === userId
      ? conversation.seller.toString()
      : conversation.buyer.toString();
    io.to(`user-${recipientId}`).emit('new-message', messagePayload);
  }

  return successResponse(res, populatedMessage, 'Message sent', 201);
});

// @desc   Get count of unread conversations for current user
// @route  GET /api/chat/unread-count
// @access Protected
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Conversation.countDocuments({
    $or: [{ buyer: req.user._id }, { seller: req.user._id }],
    lastMessage: { $ne: '' },
    readBy: { $nin: [req.user._id] },
  });

  return successResponse(res, { count });
});

// @desc   Mark a conversation as read by the current user
// @route  PATCH /api/chat/:conversationId/read
// @access Protected
const markConversationRead = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.conversationId);
  if (!conversation) {
    res.status(404);
    throw new Error('Conversation not found');
  }

  const userId = req.user._id.toString();
  const updateQuery = conversation.buyer.toString() === userId
    ? { buyerUnreadCount: 0 }
    : { sellerUnreadCount: 0 };

  await Conversation.updateOne(
    { _id: req.params.conversationId },
    {
      $addToSet: { readBy: req.user._id },
      $set: updateQuery
    }
  );
  return successResponse(res, null, 'Marked as read');
});

module.exports = {
  startOrGetConversation,
  getMyConversations,
  getMessages,
  sendMessage,
  getUnreadCount,
  markConversationRead,
};
