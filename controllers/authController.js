const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, generateToken } = require('../utils/apiResponse');
const { sendWelcomeEmail } = require('../utils/emailService');

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

// @desc   Register new user
// @route  POST /api/auth/register
// @access Public
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('Email already registered');
  }

  const user = await User.create({ name, email, password, phone });

  // Send welcome email (non-blocking)
  sendWelcomeEmail(user).catch(console.error);

  const token = generateToken(user._id);

  // Log activity
  await logActivity(req, user.name, 'Registered');

  return successResponse(
    res,
    {
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
    },
    'Registration successful',
    201
  );
});

// @desc   Login user
// @route  POST /api/auth/login
// @access Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  if (user.isBanned) {
    res.status(403);
    throw new Error('Your account has been banned. Contact support.');
  }

  const token = generateToken(user._id);

  return successResponse(res, {
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      avatar: user.avatar,
    },
  }, 'Login successful');
});

// @desc   Get logged-in user profile
// @route  GET /api/auth/me
// @access Protected
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  return successResponse(res, user, 'User profile fetched');
});

// @desc   Update profile
// @route  PUT /api/auth/me
// @access Protected
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const user = await User.findById(req.user._id);

  if (name) user.name = name;
  if (phone) user.phone = phone;

  const updatedUser = await user.save();
  return successResponse(res, updatedUser, 'Profile updated');
});

// @desc   Change password
// @route  PUT /api/auth/change-password
// @access Protected
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.matchPassword(currentPassword))) {
    res.status(400);
    throw new Error('Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();
  return successResponse(res, null, 'Password changed successfully');
});

module.exports = { register, login, getMe, updateProfile, changePassword };
