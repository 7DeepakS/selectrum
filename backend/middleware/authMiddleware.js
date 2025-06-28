// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust path as needed
const JWT_SECRET = process.env.JWT_SECRET;

const sendAuthError = (res, message = 'Not authorized, token failed') => {
  return res.status(401).json({ success: false, error: message });
};

const authMiddleware = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);

      // Attach user to request object, excluding password
      req.user = await User.findById(decoded.user.id).select('-password');

      if (!req.user) {
        return sendAuthError(res, 'User not found.');
      }
      next();
    } catch (error) {
      console.error('Auth Middleware Error:', error.message);
      if (error.name === 'TokenExpiredError') {
        return sendAuthError(res, 'Token expired, please log in again.');
      }
      return sendAuthError(res, 'Not authorized, token invalid.');
    }
  }

  if (!token) {
    return sendAuthError(res, 'Not authorized, no token.');
  }
};

// Middleware to check for specific roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `User role '${req.user ? req.user.role : 'none'}' is not authorized to access this route.`,
      });
    }
    next();
  };
};

module.exports = { authMiddleware, authorizeRoles };