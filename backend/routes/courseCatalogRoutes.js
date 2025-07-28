// backend/routes/courseCatalogRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Course = require('../models/Course');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

const sendErrorResponse = (res, statusCode, message) => res.status(statusCode).json({ success: false, error: message });

// GET /api/catalog/courses - Get all courses from the master catalog
router.get('/', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const courses = await Course.find().populate('prerequisites', 'title').sort('title').lean();
        res.json({ success: true, data: courses });
    } catch (err) { next(err); }
});

// POST /api/catalog/courses - Create a new course in the catalog
router.post('/', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { title, description, prerequisites } = req.body;
        if (!title?.trim()) return sendErrorResponse(res, 400, 'Course title is required.');

        const newCourse = new Course({ title, description, prerequisites });
        await newCourse.save();
        res.status(201).json({ success: true, data: newCourse });
    } catch (err) {
        if (err.code === 11000) return sendErrorResponse(res, 400, 'A course with this title already exists.');
        next(err);
    }
});

// PUT /api/catalog/courses/:courseId - Update a course in the catalog
router.put('/:courseId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { title, description, prerequisites } = req.body;
        if (!mongoose.Types.ObjectId.isValid(courseId)) return sendErrorResponse(res, 400, 'Invalid Course ID.');

        const updatedCourse = await Course.findByIdAndUpdate(
            courseId,
            { title, description, prerequisites },
            { new: true, runValidators: true }
        );

        if (!updatedCourse) return sendErrorResponse(res, 404, 'Course not found.');
        res.json({ success: true, message: 'Course updated successfully.', data: updatedCourse });
    } catch (err) { next(err); }
});

// DELETE /api/catalog/courses/:courseId - Delete a course from the catalog
router.delete('/:courseId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { courseId } = req.params;
        // Advanced: Check if this course is currently offered in any event or is a prerequisite for another course before deleting.
        // For now, we'll proceed with a direct delete.
        const deletedCourse = await Course.findByIdAndDelete(courseId);
        if (!deletedCourse) return sendErrorResponse(res, 404, 'Course not found.');
        res.json({ success: true, message: 'Course deleted from catalog.' });
    } catch (err) { next(err); }
});

module.exports = router;