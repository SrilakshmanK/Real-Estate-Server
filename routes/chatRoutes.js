const express = require('express');
const router = express.Router();
const {
  startOrGetConversation,
  getMyConversations,
  getMessages,
  sendMessage,
  getUnreadCount,
  markConversationRead,
} = require('../controllers/chatController');
const { protect, notBanned } = require('../middleware/auth');

// All chat routes require authentication
router.post('/start', protect, notBanned, startOrGetConversation);
router.get('/unread-count', protect, getUnreadCount);
router.get('/conversations', protect, getMyConversations);
router.get('/:conversationId/messages', protect, getMessages);
router.post('/:conversationId/messages', protect, notBanned, sendMessage);
router.patch('/:conversationId/read', protect, markConversationRead);

module.exports = router;

