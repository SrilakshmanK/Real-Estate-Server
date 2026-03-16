const express = require('express');
const router = express.Router();
const { register, login, getMe, updateProfile, changePassword } = require('../controllers/authController');
const { protect, notBanned } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/me', protect, notBanned, updateProfile);
router.put('/change-password', protect, notBanned, changePassword);

module.exports = router;
