// routes/students.js
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware'); // Adjusted path

// GET /api/students - Get all students (Admin only)
router.get('/', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    // Select specific fields, exclude password implicitly due to schema, but good to be explicit
    const students = await User.find({ role: 'student' })
                               .select('username name department createdAt') // Add more fields if needed
                               .sort({ createdAt: -1 }) // Sort by creation date, newest first
                               .lean();
    res.json({ success: true, count: students.length, data: students });
  } catch (err) {
    console.error('Error fetching students:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch students.' });
  }
});

module.exports = router;