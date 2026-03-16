const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// ─── Protect: verify JWT token ───────────────────────────────
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token provided');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = await User.findById(decoded.id).select('-password');

  if (!req.user) {
    res.status(401);
    throw new Error('User not found');
  }

  next();
});

// ─── notBanned: check user is not banned ─────────────────────
const notBanned = asyncHandler(async (req, res, next) => {
  if (req.user.isBanned) {
    res.status(403);
    throw new Error('Your account has been banned. Contact support.');
  }
  next();
});

// ─── adminOnly: check user has admin role ────────────────────
const adminOnly = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Access denied. Admins only.');
  }
  next();
});

module.exports = { protect, notBanned, adminOnly };
