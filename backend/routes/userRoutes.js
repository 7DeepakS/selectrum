// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware } = require('../middleware/authMiddleware'); // Protect this route

// Helper
const sendErrorResponse = (res, statusCode, message) => {
  res.status(statusCode).json({ success: false, error: message });
};

// POST /api/users/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  console.log('CHANGE_PW: Request received for /api/users/change-password');
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const userId = req.user.id;

    if (!newPassword || !confirmNewPassword) {
      return sendErrorResponse(res, 400, 'New password and confirmation are required.');
    }
    if (newPassword !== confirmNewPassword) {
      return sendErrorResponse(res, 400, 'New passwords do not match.');
    }
    if (newPassword.length < 6) {
      return sendErrorResponse(res, 400, 'New password must be at least 6 characters long.');
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return sendErrorResponse(res, 404, 'User not found.');
    }

    // Handle logic for when currentPassword is required vs. first forced change
    if (currentPassword) {
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            console.log(`CHANGE_PW: Incorrect current password for user ${user.username}`);
            return sendErrorResponse(res, 401, 'Incorrect current password.');
        }
        // Optional: Prevent using the same password
        if (await user.comparePassword(newPassword)) {
            console.log(`CHANGE_PW: New password same as old for user ${user.username}`);
            return sendErrorResponse(res, 400, 'New password cannot be the same as the old password.');
        }
    } else if (!user.requiresPasswordChange) {
        // If currentPassword is NOT provided, AND it's NOT a forced initial change, then it's an error.
        console.log(`CHANGE_PW: Current password missing for non-forced change by user ${user.username}`);
        return sendErrorResponse(res, 400, 'Current password is required to change your password at this time.');
    }
    // If currentPassword is not provided AND user.requiresPasswordChange IS true, we allow it (initial forced change).

    user.password = newPassword; // Pre-save hook in User model will hash it
    user.requiresPasswordChange = false;

    await user.save();
    console.log(`CHANGE_PW: Password changed successfully for user ${user.username}`);

    const updatedUserResponse = {
        _id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        department: user.department,
        requiresPasswordChange: user.requiresPasswordChange,
    };

    res.json({
      success: true,
      message: 'Password changed successfully.',
      user: updatedUserResponse
    });

  } catch (err) {
    console.error('CHANGE_PW: CRITICAL ERROR in /change-password route:', err);
    sendErrorResponse(res, 500, 'Server error during password change.');
  }
});

module.exports = router;