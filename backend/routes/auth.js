// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
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

// POST /api/auth/register
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
      requiresPasswordChange: user.requiresPasswordChange, // Include for consistency, though it'll be true
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

// POST /api/auth/login
router.post('/login', async (req, res) => {
  console.log('LOGIN: Request received for /api/auth/login');
  try {
    const { username, password } = req.body;
    console.log(`LOGIN: Attempting login for username: ${username}`);

    if (!username || !password) {
      console.log('LOGIN: Username or password missing');
      return sendErrorResponse(res, 400, 'Username and password are required.');
    }

    console.log('LOGIN: Searching for user...');
    // Fetch user, including the requiresPasswordChange field directly
    const user = await User.findOne({ username: username.toLowerCase() }).select('+password');
    console.log('LOGIN: User.findOne completed.');

    if (!user) {
      console.log(`LOGIN: User not found for username: ${username.toLowerCase()}`);
      return sendErrorResponse(res, 401, 'Invalid credentials (user not found).');
    }
    console.log(`LOGIN: User found: ${user.username}, ID: ${user._id}`);

    console.log('LOGIN: Comparing password...');
    const isMatch = await user.comparePassword(password);
    console.log(`LOGIN: Password comparison result for ${username}: ${isMatch}`);

    if (!isMatch) {
      console.log(`LOGIN: Password does not match for ${username}`);
      return sendErrorResponse(res, 401, 'Invalid credentials (password mismatch).');
    }

    console.log('LOGIN: Password matched. Generating token...');
    const payload = {
      user: {
        id: user._id,
        role: user.role,
        username: user.username
      }
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log('LOGIN: Token generated.');

    // Prepare user object for response
    const userResponse = {
      _id: user._id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department,
      requiresPasswordChange: user.requiresPasswordChange, // <--- INCLUDE THE FLAG
    };

    res.json({
      success: true,
      token,
      user: userResponse
    });
    console.log(`LOGIN: Login successful for ${user.username}. requiresPasswordChange: ${user.requiresPasswordChange}. Response sent.`);

  } catch (err) {
    console.error('LOGIN: CRITICAL ERROR in /login route:', err);
    console.error('LOGIN: Error Name:', err.name);
    console.error('LOGIN: Error Message:', err.message);
    console.error('LOGIN: Error Stack:', err.stack);
    sendErrorResponse(res, 500, 'Server error during login.');
  }
});

module.exports = router;