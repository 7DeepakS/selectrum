const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog'); // <-- 1. IMPORT THE NEW MODEL
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined. Set it in your .env file.");
  process.exit(1);
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

const sendErrorResponse = (res, statusCode, message) => {
  res.status(statusCode).json({ success: false, error: message });
};

// POST /api/auth/register (No changes made here)
router.post('/register', async (req, res) => {
  console.log('REGISTER: Request received for /api/auth/register');
  try {
    const { username, name, role, password, department } = req.body;
    console.log(`REGISTER: Attempting registration for username: ${username}`);

    if (!username || !password || !role || !name) {
      console.log('REGISTER: Missing required fields.');
      return sendErrorResponse(res, 400, 'Username, name, role, and password are required.');
    }
    if (password.length < 6) {
      console.log('REGISTER: Password too short.');
      return sendErrorResponse(res, 400, 'Password must be at least 6 characters long.');
    }
    if (!['admin', 'student'].includes(role)) {
      console.log(`REGISTER: Invalid role specified: ${role}`);
      return sendErrorResponse(res, 400, 'Invalid role specified.');
    }

    console.log('REGISTER: Checking for existing user...');
    let existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      console.log(`REGISTER: Username ${username.toLowerCase()} already exists.`);
      return sendErrorResponse(res, 400, 'Username already exists.');
    }
    console.log('REGISTER: User does not exist. Proceeding with creation...');

    const user = new User({
      username: username.toLowerCase(),
      name,
      role,
      password,
      department,
      // requiresPasswordChange will default to true from schema
    });
    console.log('REGISTER: New user object created. Saving...');
    await user.save();
    console.log(`REGISTER: User ${user.username} saved successfully.`);

    const userResponse = {
      _id: user._id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department,
      requiresPasswordChange: user.requiresPasswordChange,
    };

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      user: userResponse
    });
    console.log(`REGISTER: Registration successful for ${user.username}. Response sent.`);

  } catch (err) {
    console.error('REGISTER: CRITICAL ERROR in /register route:', err);
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(val => val.message);
        return sendErrorResponse(res, 400, messages.join(', '));
    }
    sendErrorResponse(res, 500, 'Server error during registration.');
  }
});

// POST /api/auth/login (Enhanced with logging)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendErrorResponse(res, 400, 'Username and password are required.');
    }

    const user = await User.findOne({ username: username.toLowerCase() }).select('+password');

    // Consolidated check for user not found OR password mismatch
    if (!user || !(await user.comparePassword(password))) {
      // We don't log failed attempts here as per your request to keep it simple,
      // but this is where failed login logging would go.
      return sendErrorResponse(res, 401, 'Invalid credentials.');
    }

    // --- Login Successful ---

    // 2. CREATE AND SAVE THE LOG ENTRY
    try {
      const logEntry = new ActivityLog({
        user: user._id,
        username: user.username,
        action: 'LOGIN_SUCCESS',
        details: {
          ip: req.ip, // Express automatically provides the client IP address
        }
      });
      await logEntry.save();
    } catch (logError) {
      // If logging fails for any reason, we don't want to fail the entire login process.
      // We just log the error to the server console.
      console.error('Failed to save login activity log:', logError);
    }

    const payload = {
      user: {
        id: user._id,
        role: user.role,
        username: user.username
      }
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const userResponse = {
      _id: user._id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department,
      requiresPasswordChange: user.requiresPasswordChange,
    };

    res.json({
      success: true,
      token,
      user: userResponse
    });

  } catch (err) {
    console.error('LOGIN: CRITICAL ERROR in /login route:', err);
    sendErrorResponse(res, 500, 'Server error during login.');
  }
});

module.exports = router;