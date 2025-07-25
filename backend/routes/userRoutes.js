// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Event = require('../models/Event');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

// Helper for consistent error responses
const sendErrorResponse = (res, statusCode, message) => {
  res.status(statusCode).json({ success: false, error: message });
};


// =========================================================================
// --- ADMIN USER MANAGEMENT ROUTES ---
// =========================================================================

// GET /api/users/students - Get a list of all users with the 'student' role
router.get('/students', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const students = await User.find({ role: 'student' })
            .select('-password') // Explicitly exclude password hash for security
            .sort({ name: 1 })   // Sort alphabetically by name
            .lean();
        res.json({ success: true, data: students });
    } catch (err) {
        console.error('Error fetching students:', err.stack);
        next(err); // Pass errors to the global error handler
    }
});

// PUT /api/users/:userId - Update a student's details (e.g., name, department)
router.put('/:userId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { name, username, department } = req.body;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return sendErrorResponse(res, 400, 'Invalid user ID format.');
        }

        const updateFields = {};
        if (name) updateFields.name = name.trim();
        if (username) updateFields.username = username.trim().toLowerCase();
        if (department !== undefined) updateFields.department = department.trim(); // Allow setting department to empty string

        if (Object.keys(updateFields).length === 0) {
            return sendErrorResponse(res, 400, 'No fields to update were provided.');
        }
        
        const updatedUser = await User.findByIdAndUpdate(userId, updateFields, { new: true, runValidators: true }).select('-password');
        if (!updatedUser) {
            return sendErrorResponse(res, 404, 'User not found.');
        }

        res.json({ success: true, message: 'Student details updated successfully.', data: updatedUser });
    } catch (err) {
        console.error(`Error updating user ${req.params.userId}:`, err.stack);
        next(err);
    }
});

// DELETE /api/users/:userId - Delete a specific user
router.delete('/:userId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return sendErrorResponse(res, 400, 'Invalid user ID format.');
        }
        
        const userToDelete = await User.findById(userId);
        if (!userToDelete) {
            return sendErrorResponse(res, 404, 'User not found.');
        }

        // Un-enroll the user from all event slots to prevent "ghost" IDs
        await Event.updateMany(
            {}, // No filter on events, check all of them
            { $pull: { "courses.$[].slots.$[].enrolled": userId } } 
        );
        
        // Delete the user document itself
        await User.findByIdAndDelete(userId);
        
        res.json({ success: true, message: `User "${userToDelete.username}" has been permanently deleted.` });
    } catch (err) {
        console.error(`Error deleting user ${req.params.userId}:`, err.stack);
        next(err);
    }
});

// POST /api/users/add-student - Add a new student
router.post('/add-student', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
      const { username, name, password, department } = req.body;
      if (!username?.trim() || !name?.trim() || !password) {
        return sendErrorResponse(res, 400, 'Username, name, and password are required.');
      }
      if (password.length < 6) { return sendErrorResponse(res, 400, 'Password must be at least 6 characters long.');}
      
      const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
      if (existingUser) {
        return sendErrorResponse(res, 400, `User with username "${username.trim()}" already exists.`);
      }
      
      const user = new User({
          username: username.trim().toLowerCase(),
          name: name.trim(),
          role: 'student',
          password, // Mongoose pre-save hook will hash this
          department: department ? department.trim() : null 
      });
      await user.save();

      const userResponse = { _id: user._id, username: user.username, name: user.name, role: user.role, department: user.department };
      res.status(201).json({ success: true, message: 'Student added successfully.', data: userResponse });
    } catch (err) {
      console.error('Error adding student:', err.stack);
      next(err);
    }
});


// =========================================================================
// --- USER SELF-MANAGEMENT ROUTES ---
// =========================================================================

// POST /api/users/change-password
router.post('/change-password', authMiddleware, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return sendErrorResponse(res, 400, 'New password must be at least 6 characters long.');
        }

        const user = await User.findById(req.user.id).select('+password');
        if (!user) {
            return sendErrorResponse(res, 404, 'User not found.');
        }

        // If it's not a forced, first-time change, the current password is required and must be correct.
        if (!user.requiresPasswordChange) {
            if (!currentPassword || !(await user.comparePassword(currentPassword))) {
                return sendErrorResponse(res, 401, 'Incorrect current password.');
            }
        }
        
        // Prevent setting the same password
        if (await user.comparePassword(newPassword)) {
            return sendErrorResponse(res, 400, 'New password cannot be the same as the old password.');
        }
        
        user.password = newPassword;
        user.requiresPasswordChange = false;
        await user.save();
        
        // Re-fetch user without the password to send back a clean object
        const updatedUser = await User.findById(user._id).lean();
        
        res.json({ success: true, message: 'Password changed successfully.', user: updatedUser });
    } catch (err) {
        console.error('Error in /change-password route:', err.stack);
        next(err);
    }
});

module.exports = router;