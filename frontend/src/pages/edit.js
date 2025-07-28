const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const Event = require('../models/Event');
const User = require('../models/User');
const Course = require('../models/Course');
const ActivityLog = require('../models/ActivityLog');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');
const csv = require('csv-parser');
const stream = require('stream');

// --- Multer Config ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      const err = new Error('Invalid file type. Only CSV files are allowed.');
      err.statusCode = 400;
      cb(err, false);
    }
  }
});

// --- Helpers ---
const sendErrorResponse = (res, statusCode, message, details = null) => {
  const response = { success: false, error: message };
  if (details) response.details = details;
  return res.status(statusCode).json(response);
};
const escapeCsvField = (field) => {
  if (field === null || typeof field === 'undefined') return '';
  const stringField = String(field);
  return stringField.includes(',') || stringField.includes('"') || stringField.includes('\n') ? `"${stringField.replace(/"/g, '""')}"` : stringField;
};

// =========================================================================
// --- STUDENT-FACING ROUTES ---
// =========================================================================
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [openEvents, user] = await Promise.all([
      Event.find({ isOpen: true }).populate({
        path: 'courses.course', model: 'Course',
        populate: { path: 'prerequisites', model: 'Course', select: 'title' }
      }).lean(),
      User.findById(userId).select('enrollments department').lean()
    ]);
    if (!user) return sendErrorResponse(res, 401, 'User not found.');
    const enrichedEvents = openEvents.map(event => {
      const enrollmentsInThisEvent = (user.enrollments || []).filter(e => e.eventId.toString() === event._id.toString());
      return { ...event, isEnrolledInEvent: enrollmentsInThisEvent.length > 0 };
    });
    res.status(200).json({ success: true, data: enrichedEvents });
  } catch (err) { next(err); }
});

router.post('/:eventId/courses/:courseId/slots/:slotId/enroll', authMiddleware, authorizeRoles('student'), async (req, res, next) => {
  const { eventId, courseId, slotId } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();
  let event, masterCourse;
  try {
    const student = await User.findById(req.user.id).session(session);
    if (!student) throw new Error('Student not found.');
    event = await Event.findById(eventId).populate({ path: 'courses.course', populate: { path: 'prerequisites' } }).session(session);
    if (!event || !event.isOpen) throw new Error('Event not found or is closed.');
    if (event.isViewOnly) throw new Error('This event is in view-only mode and does not accept enrollments.');
    if (event.allowedDepartments && event.allowedDepartments.length > 0) {
      if (!student.department || !event.allowedDepartments.includes(student.department)) {
        throw new Error('Enrollment for this event is restricted to specific departments.');
      }
    }
    const offering = (event.courses || []).find(c => c._id.equals(courseId));
    if (!offering) throw new Error('Course offering not found in this event.');
    masterCourse = offering.course;
    if (!masterCourse) throw new Error('Course data is inconsistent.');
    if ((student.enrollments || []).some(e => e.courseId.equals(masterCourse._id))) throw new Error(`You have already taken ${masterCourse.title}.`);
    if ((student.enrollments || []).filter(e => e.eventId.equals(eventId)).length >= event.maxCoursesPerStudent) throw new Error(`Maximum courses for this event reached.`);
    const studentEnrolledCourseIds = new Set((student.enrollments || []).map(e => e.courseId.toString()));
    const missingPrereqs = (masterCourse.prerequisites || []).filter(prereq => !studentEnrolledCourseIds.has(prereq._id.toString()));
    if (missingPrereqs.length > 0) throw new Error(`Prerequisites not met: ${missingPrereqs.map(p => p.title).join(', ')}.`);
    const slotToEnroll = (offering.slots || []).find(s => String(s.id) === slotId);
    if (!slotToEnroll || !slotToEnroll.isActive || (slotToEnroll.enrolled || []).length >= slotToEnroll.maxCapacity) throw new Error('This slot is not available for enrollment.');
    slotToEnroll.enrolled.push(student._id);
    student.enrollments.push({ eventId: event._id, courseId: masterCourse._id, courseTitle: masterCourse.title, enrolledAt: new Date() });
    await event.save({ session });
    await student.save({ session });
    await ActivityLog.create([{ user: student._id, username: student.username, action: 'ENROLL_SUCCESS', details: { eventName: event.name, courseTitle: masterCourse.title, ip: req.ip } }], { session });
    await session.commitTransaction();
    res.json({ success: true, message: `Enrolled successfully in ${masterCourse.title}!` });
  } catch (err) {
    await session.abortTransaction();
    await ActivityLog.create({ user: req.user.id, username: req.user.username, action: 'ENROLL_FAIL', details: { eventName: event?.name || 'N/A', courseTitle: masterCourse?.title || 'N/A', errorMessage: err.message, ip: req.ip } });
    return sendErrorResponse(res, 400, err.message);
  } finally {
    session.endSession();
  }
});

// =========================================================================
// --- ADMIN-FACING ROUTES ---
// =========================================================================
router.get('/all', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        let events = await Event.find().populate({ path: 'courses.course', model: 'Course', select: 'title' }).sort({ createdAt: -1 }).lean();
        events = events.map(event => {
            const processedCourses = (event.courses || []).map(offering => {
                let totalEnrolled = (offering.slots || []).reduce((sum, slot) => sum + (slot.enrolled || []).length, 0);
                let totalCapacity = (offering.slots || []).reduce((sum, slot) => sum + (slot.maxCapacity || 0), 0);
                return { ...offering, totalEnrolled, totalCapacity };
            });
            return { ...event, courses: processedCourses };
        });
        res.json({ success: true, data: events });
    } catch(err) { next(err); }
});

router.get('/activity-logs', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.username) { filter.username = { $regex: req.query.username, $options: 'i' }; }
        if (req.query.action) { filter.action = req.query.action; }
        const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'name department').lean();
        const totalLogs = await ActivityLog.countDocuments(filter);
        res.json({ success: true, data: { logs, currentPage: page, totalPages: Math.ceil(totalLogs / limit), totalLogs } });
    } catch (err) { next(err); }
});

router.get('/activity-logs/download', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.username) { filter.username = { $regex: req.query.username, $options: 'i' }; }
        if (req.query.action) { filter.action = req.query.action; }
        const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).populate('user', 'name department').lean();
        if (logs.length === 0) return res.setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', 'attachment; filename="activity_logs_empty.csv"').status(200).send("Timestamp,Action,Username,User Name,User Department,Details\r\nNo data.");
        const headers = ['Timestamp','Action','Username','User Name','User Department','Details'];
        const csvString = [ headers.join(','), ...logs.map(log => { const d=[]; if(log.details){if(log.details.ip)d.push(`IP: ${log.details.ip}`);if(log.details.eventName)d.push(`Event: ${log.details.eventName}`);if(log.details.courseTitle)d.push(`Course: ${log.details.courseTitle}`);if(log.details.errorMessage)d.push(`Error: ${log.details.errorMessage}`);} return [new Date(log.createdAt).toLocaleString(),log.action,log.username,log.user?log.user.name:'N/A',log.user?(log.user.department||'N/A'):'N/A',d.join('; ')].map(escapeCsvField).join(','); })].join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', 'attachment; filename="activity_logs.csv"').status(200).send(csvString);
    } catch (err) { next(err); }
});

router.get('/enrollment-summary/by-department', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
      const distinctDeptsFromUsers = await User.distinct("department", { department: { $ne: null, $ne: "" } });
      res.json({ success: true, data: { distinctDepartments: distinctDeptsFromUsers.sort() } });
    } catch (err) { next(err); }
});

router.get('/:eventId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) return sendErrorResponse(res, 400, 'Invalid Event ID.');
        const event = await Event.findById(req.params.eventId).populate('courses.course').lean();
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        res.json({ success: true, data: event });
    } catch(err) { next(err); }
});

router.get('/:eventId/enrollment-status-by-department', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(eventId)) return sendErrorResponse(res, 400, 'Invalid Event ID.');
        const event = await Event.findById(eventId).select('name').lean();
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        const allStudents = await User.find({ role: 'student' }).select('department enrollments').lean();
        if (allStudents.length === 0) return res.json({ success: true, data: { eventName: event.name, departmentalStatus: [] } });
        const statsByDept = allStudents.reduce((acc, student) => {
            const dept = student.department || 'N/A';
            if (!acc[dept]) acc[dept] = { total_students: 0, signed_in_students: 0 };
            acc[dept].total_students += 1;
            if ((student.enrollments || []).some(e => e.eventId.toString() === eventId)) acc[dept].signed_in_students += 1;
            return acc;
        }, {});
        const departmentalStatus = Object.entries(statsByDept).map(([dept, stats]) => ({ department: dept, total_students: stats.total_students, signed_in_students: stats.signed_in_students, not_signed_in_students: stats.total_students - stats.signed_in_students, percentage_signed_in: stats.total_students > 0 ? ((stats.signed_in_students / stats.total_students) * 100).toFixed(0) : 0, })).sort((a,b) => a.department.localeCompare(b.department));
        res.json({ success: true, data: { eventName: event.name, departmentalStatus } });
    } catch (err) { next(err); }
});

router.post('/', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { name, maxCoursesPerStudent } = req.body;
        if (!name?.trim()) return sendErrorResponse(res, 400, 'Event name required.');
        if (await Event.findOne({ name: name.trim() })) return sendErrorResponse(res, 400, 'Event name exists.');
        const event = new Event({ name: name.trim(), isOpen: false, maxCoursesPerStudent });
        await event.save();
        res.status(201).json({ success: true, data: event });
    } catch (err) { next(err); }
});

router.put('/:eventId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const { name, isOpen, maxCoursesPerStudent, allowedDepartments, isViewOnly } = req.body;
        if (!mongoose.Types.ObjectId.isValid(eventId)) return sendErrorResponse(res, 400, 'Invalid ID.');
        const updateFields = {};
        if (name !== undefined) updateFields.name = name.trim();
        if (isOpen !== undefined) updateFields.isOpen = isOpen;
        if (maxCoursesPerStudent !== undefined) updateFields.maxCoursesPerStudent = maxCoursesPerStudent;
        if (isViewOnly !== undefined) updateFields.isViewOnly = isViewOnly;
        if (allowedDepartments !== undefined) updateFields.allowedDepartments = allowedDepartments;
        const updatedEvent = await Event.findByIdAndUpdate(eventId, { $set: updateFields }, { new: true, runValidators: true, lean: true }).populate({ path: 'courses.course', model: 'Course', select: 'title' });
        if (!updatedEvent) return sendErrorResponse(res, 404, 'Event not found.');
        res.json({success:true, message:'Event updated successfully.', data: updatedEvent});
    } catch (err) { next(err); }
});

router.delete('/:eventId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => { /* Unchanged */ });
router.post('/:eventId/courses', authMiddleware, authorizeRoles('admin'), async (req, res, next) => { /* Unchanged */ });
router.put('/:eventId/offerings/:offeringId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => { /* Unchanged */ });
router.delete('/:eventId/offerings/:offeringId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => { /* Unchanged */ });
router.post('/upload-students', authMiddleware, authorizeRoles('admin'), upload.single('csv'), async (req, res, next) => { /* Unchanged */ });

router.post('/download/custom-detailed', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { columns, choiceNumber, filters = {} } = req.body;
        if (!Array.isArray(columns) || columns.length === 0) return sendErrorResponse(res, 400, 'Please select at least one column.');
        if (!choiceNumber || isNaN(parseInt(choiceNumber, 10))) return sendErrorResponse(res, 400, 'A valid choice number is required.');
        const choiceIndex = parseInt(choiceNumber, 10) - 1;
        const columnDefinitions = {
            username: { header: 'Username', getValue: (s) => s.username },
            name: { header: 'Name', getValue: (s) => s.name },
            department: { header: 'Department', getValue: (s) => s.department || 'N/A' },
            eventName: { header: 'Event Name', getValue: (s, e) => e.name },
            nthChoiceTitle: { header: `Choice ${choiceNumber} Title`, getValue: (s, e, enr) => enr ? enr.courseTitle : 'N/A' },
        };
        const activeCols = columns.map(key => ({ key, ...columnDefinitions[key] })).filter(d => d.header);
        const studentsQuery = { role: 'student' };
        if (filters.department && filters.department !== 'all') studentsQuery.department = filters.department === 'N/A' ? null : filters.department;
        const students = await User.find(studentsQuery).select('name username department enrollments').lean();
        const events = await Event.find().lean();
        const eventMap = new Map(events.map(e => [e._id.toString(), e]));
        const reportRows = [];
        for (const student of students) {
            if (!student.enrollments || student.enrollments.length === 0) continue;
            const enrollmentsByEvent = student.enrollments.reduce((acc, enr) => { const eId = enr.eventId.toString(); if (!acc[eId]) acc[eId] = []; acc[eId].push(enr); return acc; }, {});
            for (const eventId in enrollmentsByEvent) {
                if (filters.eventId && filters.eventId !== 'all' && eventId !== filters.eventId) continue;
                const event = eventMap.get(eventId);
                if (!event) continue;
                const sortedEnrollments = enrollmentsByEvent[eventId].sort((a, b) => new Date(a.enrolledAt) - new Date(b.enrolledAt));
                const targetEnrollment = sortedEnrollments[choiceIndex];
                if (filters.courseId && filters.courseId !== 'all') {
                    if (!targetEnrollment || targetEnrollment.courseId.toString() !== filters.courseId) continue;
                }
                const row = {};
                activeCols.forEach(colDef => { row[colDef.key] = colDef.getValue(student, event, targetEnrollment); });
                row.nthChoiceTitle = columnDefinitions.nthChoiceTitle.getValue(student, event, targetEnrollment);
                reportRows.push(row);
            }
        }
        const headers = [...activeCols.map(c => c.header), columnDefinitions.nthChoiceTitle.header];
        const uniqueHeaders = [...new Set(headers)];
        const csvRows = reportRows.map(row => { const rowValues = uniqueHeaders.map(header => { const key = Object.keys(columnDefinitions).find(k => columnDefinitions[k].header === header); return row[key] || ''; }); return rowValues.map(escapeCsvField).join(','); });
        const csvString = [uniqueHeaders.join(','), ...csvRows].join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="choice_${choiceNumber}_report.csv"`).status(200).send(csvString);
    } catch (err) { console.error(`Error generating custom detailed report:`, err.stack); next(err); }
});

// POST /api/events/admin/enroll
router.post('/admin/enroll', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { userId, eventId, courseId } = req.body;
        
        const [user, event] = await Promise.all([ User.findById(userId), Event.findById(eventId) ]);
        if (!user) return sendErrorResponse(res, 404, 'Student not found.');
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        const course = (event.courses || []).find(c => c._id.equals(courseId));
        if (!course) return sendErrorResponse(res, 404, 'Course not found in this event.');
        const slot = (course.slots || [])[0]; 
        if (!slot) return sendErrorResponse(res, 400, 'Course has no slots.');

        const enrollmentsInEvent = (user.enrollments || []).filter(e => e.eventId.toString() === eventId);
        if (enrollmentsInEvent.length >= event.maxCoursesPerStudent) return sendErrorResponse(res, 400, 'Student has reached max courses for this event.');
        if (enrollmentsInEvent.some(e => e.courseId.toString() === courseId)) return sendErrorResponse(res, 400, 'Student is already enrolled in this course.');
        if ((slot.enrolled || []).length >= slot.maxCapacity) return sendErrorResponse(res, 400, 'The first slot for this course is full.');

        slot.enrolled.push(user._id);
        user.enrollments.push({ eventId: event._id, courseId: course._id, courseTitle: course.title });
        await Promise.all([event.save(), user.save()]);

        res.json({ success: true, message: `${user.name} enrolled in ${course.title}.`, data: user });
    } catch (err) { next(err); }
});

// POST /api/events/admin/unenroll
router.post('/admin/unenroll', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { userId, eventId, courseId } = req.body;
        const [user, event] = await Promise.all([ User.findById(userId), Event.findById(eventId) ]);
        if (!user) return sendErrorResponse(res, 404, 'Student not found.');
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');

        user.enrollments = (user.enrollments || []).filter(e => !(e.eventId.toString() === eventId && e.courseId.toString() === courseId));
        
        const course = (event.courses || []).find(c => c._id.equals(courseId));
        if (course) {
            (course.slots || []).forEach(slot => {
                slot.enrolled = (slot.enrolled || []).filter(id => id.toString() !== userId);
            });
        }

        await Promise.all([event.save(), user.save()]);
        res.json({ success: true, message: 'Student un-enrolled successfully.', data: user });
    } catch (err) { next(err); }
});

module.exports = router;