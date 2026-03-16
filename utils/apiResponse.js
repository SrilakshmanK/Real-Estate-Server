const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const errorResponse = (res, message = 'Server Error', statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
  });
};

const generateToken = (id) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

module.exports = { successResponse, errorResponse, generateToken };
