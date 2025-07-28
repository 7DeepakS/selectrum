const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Event = require('../models/Event');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

// Helper for consistent error responses
const sendErrorResponse = (res, statusCode, message) => res.status(statusCode).json({ success: false, error: message });

// --- STUDENT-FACING ROUTES ---

// GET /api/users/my-enrollments - Get the logged-in user's enrollments
router.get('/my-enrollments', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('enrollments').lean();
    if (!user) {
      return sendErrorResponse(res, 404, 'User not found.');
    }
    res.json({
      success: true,
      data: {
        enrollments: user.enrollments || [],
      }
    });
  } catch (err) {
    console.error('Error fetching user enrollments:', err.stack);
    next(err);
  }
});

// POST /api/users/change-password (User self-service)
router.post('/change-password', authMiddleware, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) return sendErrorResponse(res, 400, 'Password must be at least 6 characters.');
        const user = await User.findById(req.user.id).select('+password');
        if (!user) return sendErrorResponse(res, 404, 'User not found.');
        if (!user.requiresPasswordChange) {
            if (!currentPassword || !(await user.comparePassword(currentPassword))) {
                return sendErrorResponse(res, 401, 'Incorrect current password.');
            }
        }
        if (await user.comparePassword(newPassword)) return sendErrorResponse(res, 400, 'New password cannot be the same as the old one.');
        user.password = newPassword;
        user.requiresPasswordChange = false;
        await user.save();
        const updatedUser = await User.findById(user._id).lean();
        res.json({ success: true, message: 'Password changed successfully.', user: updatedUser });
    } catch (err) { next(err); }
});

// --- ADMIN USER MANAGEMENT ROUTES ---

// GET /api/users/students - Get a list of all users with the 'student' role
router.get('/students', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const students = await User.find({ role: 'student' }).select('-password').sort({ name: 1 }).lean();
        res.json({ success: true, data: students });
    } catch (err) { next(err); }
});

// --- ENHANCED: Get a single student by ID with populated enrollments ---
router.get('/students/:userId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return sendErrorResponse(res, 400, 'Invalid user ID format.');
        const student = await User.findById(req.params.userId).select('-password').lean();
        if (!student) return sendErrorResponse(res, 404, 'Student not found.');
        res.json({ success: true, data: student });
    } catch (err) {
        next(err);
    }
});

// --- NEW ROUTE: Get a unique list of all departments ---
router.get('/departments', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const departments = await User.distinct("department", { 
            role: 'student', 
            department: { $ne: null, $ne: "" } 
        });
        res.json({ success: true, data: departments.sort() });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/add-student - Add a new student
router.post('/add-student', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
      const { username, name, password, department } = req.body;
      if (!username?.trim() || !name?.trim() || !password) return sendErrorResponse(res, 400, 'Username, name, and password are required.');
      const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
      if (existingUser) return sendErrorResponse(res, 400, `Username "${username.trim()}" already exists.`);
      const user = new User({ username: username.trim().toLowerCase(), name: name.trim(), role: 'student', password, department: department ? department.trim() : null });
      await user.save();
      const userResponse = { _id: user._id, username: user.username, name: user.name, role: user.role, department: user.department };
      res.status(201).json({ success: true, message: 'Student added successfully.', data: userResponse });
    } catch (err) { next(err); }
});

// PUT /api/users/:userId - Update a student's basic details
router.put('/:userId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { name, username, department } = req.body;
        if (!mongoose.Types.ObjectId.isValid(userId)) return sendErrorResponse(res, 400, 'Invalid user ID format.');

        const updateFields = {};
        if (name !== undefined) updateFields.name = name.trim();
        if (username !== undefined) updateFields.username = username.trim().toLowerCase();
        if (department !== undefined) updateFields.department = department.trim();

        const updatedUser = await User.findByIdAndUpdate(userId, updateFields, { new: true, runValidators: true }).select('-password');
        if (!updatedUser) return sendErrorResponse(res, 404, 'User not found.');

        res.json({ success: true, message: 'Student details updated.', data: updatedUser });
    } catch (err) { next(err); }
});

// POST /api/users/:userId/reset-password - Admin resets a student's password
router.post('/:userId/reset-password', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) return sendErrorResponse(res, 400, 'New password must be at least 6 characters.');
        if (!mongoose.Types.ObjectId.isValid(userId)) return sendErrorResponse(res, 400, 'Invalid user ID.');
        const user = await User.findById(userId);
        if (!user) return sendErrorResponse(res, 404, 'User not found.');
        user.password = newPassword;
        user.requiresPasswordChange = true;
        await user.save();
        res.json({ success: true, message: `Password for ${user.username} has been reset.` });
    } catch (err) { next(err); }
});

// DELETE /api/users/:userId - Delete a SINGLE student
router.delete('/:userId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) return sendErrorResponse(res, 400, 'Invalid user ID.');
        const userToDelete = await User.findById(userId);
        if (!userToDelete) return sendErrorResponse(res, 404, 'User not found.');
        await Event.updateMany({}, { $pull: { "courses.$[].slots.$[].enrolled": userId } });
        await User.findByIdAndDelete(userId);
        res.json({ success: true, message: `User "${userToDelete.username}" has been permanently deleted.` });
    } catch (err) { next(err); }
});

// DELETE /api/users - Deletes multiple users at once
router.delete('/', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { userIds } = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return sendErrorResponse(res, 400, 'An array of user IDs is required.');
        }

        for (const id of userIds) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return sendErrorResponse(res, 400, `Invalid user ID format found in the list: ${id}`);
            }
        }
        
        await Event.updateMany({}, { $pull: { "courses.$[].slots.$[].enrolled": { $in: userIds } } });
        
        const deleteResult = await User.deleteMany({ _id: { $in: userIds } });

        if (deleteResult.deletedCount === 0) {
            return sendErrorResponse(res, 404, 'No matching students found to delete.');
        }

        res.json({ 
            success: true, 
            message: `${deleteResult.deletedCount} student(s) have been permanently deleted.` 
        });
    } catch (err) {
        console.error(`Error during bulk user deletion:`, err.stack);
        next(err);
    }
});

module.exports = router;