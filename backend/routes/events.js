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
      User.findById(userId).select('enrollments department semester section').lean()
    ]);
    if (!user) return sendErrorResponse(res, 401, 'User not found.');

    const enrichedEvents = openEvents.map(event => {
      const allEnrolledCourseIds = new Set((user.enrollments || []).map(e => e.courseId.toString()));
      const enrollmentsInThisEvent = (user.enrollments || []).filter(e => e.eventId.toString() === event._id.toString());
      const enrolledCourseTitles = enrollmentsInThisEvent.map(e => e.courseTitle);
      const hasReachedEventLimit = enrollmentsInThisEvent.length >= event.maxCoursesPerStudent;

      const processedCourses = (event.courses || []).map(offering => {
        const masterCourse = offering.course;
        if (!masterCourse) return null;
        const hasAlreadyTaken = allEnrolledCourseIds.has(masterCourse._id.toString());
        const prereqsMet = (masterCourse.prerequisites || []).every(p => allEnrolledCourseIds.has(p._id.toString()));
        return { ...offering, masterCourse, prereqsMet, hasAlreadyTaken, };
      }).filter(Boolean);
      
      return { ...event, courses: processedCourses, isEnrolledInEvent: enrollmentsInThisEvent.length > 0, enrolledCourseTitles, numEnrolledInEvent: enrollmentsInThisEvent.length, hasReachedEventLimit, };
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
      if (!student.department || !event.allowedDepartments.includes(student.department)) throw new Error('Enrollment for this event is restricted to specific departments.');
    }
    if (event.allowedSemesters && event.allowedSemesters.length > 0) {
      if (!student.semester || !event.allowedSemesters.includes(student.semester)) throw new Error('Enrollment for this event is restricted to specific semesters.');
    }
    if (event.allowedSections && event.allowedSections.length > 0) {
      if (!student.section || !event.allowedSections.includes(student.section)) throw new Error('Enrollment for this event is restricted to specific sections.');
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
        const { name, isOpen, maxCoursesPerStudent, allowedDepartments, allowedSemesters, allowedSections, isViewOnly } = req.body;
        if (!mongoose.Types.ObjectId.isValid(eventId)) return sendErrorResponse(res, 400, 'Invalid ID.');
        const updateFields = {};
        if (name !== undefined) updateFields.name = name.trim();
        if (isOpen !== undefined) updateFields.isOpen = isOpen;
        if (maxCoursesPerStudent !== undefined) updateFields.maxCoursesPerStudent = maxCoursesPerStudent;
        if (isViewOnly !== undefined) updateFields.isViewOnly = isViewOnly;
        if (allowedDepartments !== undefined) updateFields.allowedDepartments = allowedDepartments;
        if (allowedSemesters !== undefined) updateFields.allowedSemesters = allowedSemesters;
        if (allowedSections !== undefined) updateFields.allowedSections = allowedSections;
        const updatedEvent = await Event.findByIdAndUpdate(eventId, { $set: updateFields }, { new: true, runValidators: true, lean: true }).populate({ path: 'courses.course', model: 'Course', select: 'title' });
        if (!updatedEvent) return sendErrorResponse(res, 404, 'Event not found.');
        const processedCourses = (updatedEvent.courses || []).map(offering => {
            let totalEnrolled = (offering.slots || []).reduce((sum, slot) => sum + (slot.enrolled || []).length, 0);
            let totalCapacity = (offering.slots || []).reduce((sum, slot) => sum + (slot.maxCapacity || 0), 0);
            return { ...offering, totalEnrolled, totalCapacity };
        });
        const finalEventData = { ...updatedEvent, courses: processedCourses };
        res.json({success:true, message:'Event updated successfully.', data: finalEventData});
    } catch (err) { next(err); }
});

router.delete('/:eventId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const eventToDelete = await Event.findByIdAndDelete(eventId);
        if (!eventToDelete) return sendErrorResponse(res, 404, 'Event not found.');
        await User.updateMany({"enrollments.eventId": eventId}, {$pull: {enrollments: {eventId: eventId}}});
        res.json({ success: true, message: `Event "${eventToDelete.name}" deleted.` });
    } catch (err) { next(err); }
});

router.post('/:eventId/courses', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const { course: courseId, slots } = req.body;
        if (!mongoose.Types.ObjectId.isValid(courseId)) return sendErrorResponse(res, 400, 'Valid course required.');
        const event = await Event.findById(eventId);
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        if((event.courses||[]).some(o=>o.course.toString()===courseId)) return sendErrorResponse(res, 400, 'Course already in event.');
        const offering = { course: courseId, slots };
        event.courses.push(offering);
        await event.save();
        res.status(201).json({success:true, message:'Course offering added.', data:offering});
    } catch(err){next(err);}
});

router.put('/:eventId/offerings/:offeringId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId, offeringId } = req.params;
        const { slots } = req.body;
        if (!slots || !Array.isArray(slots) || slots.length === 0) return sendErrorResponse(res, 400, 'At least one slot is required.');
        const event = await Event.findById(eventId);
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        const offering = event.courses.id(offeringId);
        if (!offering) return sendErrorResponse(res, 404, 'Offering not found.');
        offering.slots = slots.map((s, i) => ({ ...s, _id: s._id || new mongoose.Types.ObjectId(), id: s.id || i + 1, enrolled:[] }));
        await event.save();
        res.json({ success: true, message: 'Course offering updated successfully.', data: offering });
    } catch(err) { next(err); }
});

router.delete('/:eventId/offerings/:offeringId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId, offeringId } = req.params;
        const event = await Event.findById(eventId);
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        const offering = (event.courses||[]).id(offeringId);
        if(!offering) return sendErrorResponse(res, 404, 'Offering not found.');
        await User.updateMany({}, {$pull:{enrollments:{eventId: eventId, courseId: offering.course}}});
        event.courses.pull({_id: offeringId});
        await event.save();
        res.json({success:true, message:'Course offering removed.'});
    } catch(err){next(err);}
});

router.post('/upload-students', authMiddleware, authorizeRoles('admin'), upload.single('csv'), async (req, res, next) => { 
    try {
        if (!req.file) return sendErrorResponse(res, 400, 'No CSV file was uploaded.');
        const csvFileBuffer = req.file.buffer;
        const studentDataFromCsv = [];
        const errors = [];
        let createdCount = 0;
        const readableFileStream = new stream.Readable();
        readableFileStream.push(csvFileBuffer);
        readableFileStream.push(null);
        readableFileStream
          .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase(), skipComments: true }))
          .on('data', (row) => studentDataFromCsv.push(row))
          .on('end', async () => {
            try {
                for (let i = 0; i < studentDataFromCsv.length; i++) {
                    const row = studentDataFromCsv[i];
                    const rowIndex = i + 2; 
                    const { username, name, password, department, semester, section } = row;
                    if (!username || !name || !password) { errors.push({ row: rowIndex, student: username || 'N/A', error: 'Missing required fields: username, name, or password.' }); continue; }
                    try {
                        const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
                        if (existingUser) { errors.push({ row: rowIndex, student: username, error: `Username already exists.` }); continue; }
                        const newUser = new User({ 
                            username: username.trim().toLowerCase(), 
                            name: name.trim(), 
                            password, 
                            role: 'student', 
                            department: department?.trim(), 
                            semester: semester?.trim(), 
                            section: section?.trim() 
                        });
                        await newUser.save();
                        createdCount++;
                    } catch (dbError) { errors.push({ row: rowIndex, student: username, error: `Database error: ${dbError.message}` }); }
                }
                if (errors.length > 0 && createdCount === 0) return sendErrorResponse(res, 400, `CSV processing failed.`, { errors });
                if (errors.length > 0) return res.status(207).json({ success: true, message: `Partial success: ${createdCount} created, ${errors.length} failed.`, createdCount, errors });
                res.json({ success: true, message: `All ${createdCount} students uploaded successfully.`, createdCount });
            } catch (processError) { next(processError); }
          });
    } catch(err) { next(err); }
});

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
            semester: { header: 'Semester', getValue: (s) => s.semester || 'N/A' },
            section: { header: 'Section', getValue: (s) => s.section || 'N/A' },
            eventName: { header: 'Event Name', getValue: (s, e) => e.name },
            nthChoiceTitle: { header: `Choice ${choiceNumber} Title`, getValue: (s, e, enr) => enr ? enr.courseTitle : 'N/A' },
        };

        const activeCols = columns.map(key => ({ key, ...columnDefinitions[key] })).filter(d => d.header);
        
        // --- UPDATED: Query now includes semester and section filters ---
        const studentsQuery = { role: 'student' };
        if (filters.department && filters.department !== 'all') {
            studentsQuery.department = filters.department === 'N/A' ? null : filters.department;
        }
        if (filters.semester && filters.semester !== 'all') {
            studentsQuery.semester = filters.semester === 'N/A' ? null : filters.semester;
        }
        if (filters.section && filters.section !== 'all') {
            studentsQuery.section = filters.section === 'N/A' ? null : filters.section;
        }
        
        const students = await User.find(studentsQuery).select('name username department semester section enrollments').lean();
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
                if (filters.courseId && filters.courseId !== 'all') { if (!targetEnrollment || targetEnrollment.courseId.toString() !== filters.courseId) continue; }
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
        const { userId, eventId, courseId } = req.body; // courseId here is the OFFERING ID
        
        const [user, event] = await Promise.all([ 
            User.findById(userId), 
            Event.findById(eventId).populate('courses.course') // Populate to get master course details
        ]);
        if (!user) return sendErrorResponse(res, 404, 'Student not found.');
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');

        const offering = (event.courses || []).find(c => c._id.equals(courseId));
        if (!offering) return sendErrorResponse(res, 404, 'Course offering not found in this event.');
        
        const masterCourse = offering.course; // This is the actual course document
        if (!masterCourse) return sendErrorResponse(res, 500, 'Course data is inconsistent.');
        
        const slot = (offering.slots || [])[0];
        if (!slot) return sendErrorResponse(res, 400, 'Course has no available slots.');

        // Validation logic
        const enrollmentsInEvent = (user.enrollments || []).filter(e => e.eventId.toString() === eventId);
        if (enrollmentsInEvent.length >= event.maxCoursesPerStudent) return sendErrorResponse(res, 400, 'Student has reached the maximum number of courses for this event.');
        if ((user.enrollments || []).some(e => e.courseId.toString() === masterCourse._id.toString())) return sendErrorResponse(res, 400, 'Student is already enrolled in this course.');
        if ((slot.enrolled || []).length >= slot.maxCapacity) return sendErrorResponse(res, 400, 'The first available slot for this course is full.');

        // Perform enrollment with the CORRECT IDs
        slot.enrolled.push(user._id);
        user.enrollments.push({ 
            eventId: event._id, 
            courseId: masterCourse._id, // Push the MASTER course ID
            courseTitle: masterCourse.title, // Push the MASTER course title
            enrolledAt: new Date()
        });
        
        await Promise.all([event.save(), user.save()]);
        
        const updatedUser = await User.findById(userId).lean(); // Refetch the updated user
        res.json({ success: true, message: `${user.name} was successfully enrolled in ${masterCourse.title}.`, data: updatedUser });
    } catch (err) { next(err); }
});

// POST /api/events/admin/unenroll
router.post('/admin/unenroll', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    const { userId, eventId, courseId } = req.body; // courseId here is the MASTER course ID
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const [user, event] = await Promise.all([
            User.findById(userId).session(session),
            Event.findById(eventId).session(session)
        ]);

        if (!user) throw new Error('Student not found.');
        if (!event) throw new Error('Event not found.');

        // Step 1: Remove the enrollment from the User's personal list.
        const initialEnrollmentCount = user.enrollments.length;
        user.enrollments = (user.enrollments || []).filter(e => !(
            e.eventId.toString() === eventId && e.courseId.toString() === courseId
        ));

        // If nothing was removed, the user wasn't enrolled in the first place.
        if (user.enrollments.length === initialEnrollmentCount) {
            throw new Error('Student was not enrolled in this course for this event.');
        }

        // Step 2: Find the correct course offering by its nested master course ID.
        const offering = (event.courses || []).find(o => o.course.toString() === courseId);
        
        // Step 3: If the offering is found, remove the student's ID from all of its slots.
        if (offering) {
            (offering.slots || []).forEach(slot => {
                // Mongoose's pull method is perfect for removing items from an array.
                slot.enrolled.pull(userId);
            });
        }

        // Step 4: Save both documents within the transaction.
        await event.save({ session });
        await user.save({ session });

        await session.commitTransaction();
        
        // Refetch the updated user to send back the latest state to the modal
        const updatedUser = await User.findById(userId).lean();
        res.json({ success: true, message: 'Student un-enrolled successfully.', data: updatedUser });
    } catch (err) {
        await session.abortTransaction();
        // Use next(err) to let your global error handler manage it
        next(err);
    } finally {
        session.endSession();
    }
});

// POST /api/admin/bulk-enroll
router.post('/admin/bulk-enroll', authMiddleware, authorizeRoles('admin'), upload.single('csv'), async (req, res, next) => {
    const { eventId } = req.body;
    if (!req.file) return sendErrorResponse(res, 400, 'No CSV file provided.');
    if (!mongoose.Types.ObjectId.isValid(eventId)) return sendErrorResponse(res, 400, 'Invalid Event ID.');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const event = await Event.findById(eventId).populate('courses.course').session(session);
        if (!event) throw new Error('Event not found.');

        // Pre-fetch all users to avoid querying the DB in a loop. Create a map for fast lookups.
        const allUsernamesInCsv = [];
        const csvData = [];
        await new Promise((resolve, reject) => {
            const readableFileStream = new stream.Readable();
            readableFileStream.push(req.file.buffer);
            readableFileStream.push(null);
            readableFileStream
              .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase() }))
              .on('data', (row) => {
                  if (row.username) allUsernamesInCsv.push(row.username.toLowerCase());
                  csvData.push(row);
              })
              .on('end', resolve)
              .on('error', reject);
        });
        
        const usersFromDb = await User.find({ username: { $in: allUsernamesInCsv } }).session(session);
        const userMap = new Map(usersFromDb.map(u => [u.username, u]));
        
        // Create a map of course titles to their offering details for fast lookups.
        const courseTitleMap = new Map();
        (event.courses || []).forEach(offering => {
            if (offering.course && offering.course.title) {
                courseTitleMap.set(offering.course.title.toLowerCase(), {
                    offeringId: offering._id,
                    masterCourseId: offering.course._id,
                    masterCourseTitle: offering.course.title
                });
            }
        });

        const results = { successes: [], failures: [] };

        for (let i = 0; i < csvData.length; i++) {
            const row = csvData[i];
            const rowIndex = i + 2; // CSVs are 1-indexed, +1 for header
            const username = row.username?.trim().toLowerCase();
            const courseTitle = row.coursetitle?.trim().toLowerCase();

            if (!username || !courseTitle) {
                results.failures.push({ row: rowIndex, username: row.username, courseTitle: row.coursetitle, reason: 'Missing username or coursetitle.' });
                continue;
            }

            const student = userMap.get(username);
            if (!student) {
                results.failures.push({ row: rowIndex, username, courseTitle: row.coursetitle, reason: 'Student username not found.' });
                continue;
            }

            const courseDetails = courseTitleMap.get(courseTitle);
            if (!courseDetails) {
                results.failures.push({ row: rowIndex, username, courseTitle: row.coursetitle, reason: 'Course not found in this event.' });
                continue;
            }

            const offering = event.courses.find(o => o._id.equals(courseDetails.offeringId));
            const slot = (offering.slots || [])[0];
            
            // --- Run validations ---
            const isAlreadyEnrolled = (student.enrollments || []).some(e => e.courseId.equals(courseDetails.masterCourseId));
            const enrollmentsInThisEvent = (student.enrollments || []).filter(e => e.eventId.equals(eventId));
            const hasReachedLimit = enrollmentsInThisEvent.length >= event.maxCoursesPerStudent;
            const isSlotFull = !slot || (slot.enrolled || []).length >= slot.maxCapacity;

            if (isAlreadyEnrolled) {
                results.failures.push({ row: rowIndex, username, courseTitle: row.coursetitle, reason: 'Student already enrolled in this course (in any event).' });
            } else if (hasReachedLimit) {
                results.failures.push({ row: rowIndex, username, courseTitle: row.coursetitle, reason: 'Student has reached the enrollment limit for this event.' });
            } else if (isSlotFull) {
                results.failures.push({ row: rowIndex, username, courseTitle: row.coursetitle, reason: 'The first available slot for this course is full.' });
            } else {
                // All checks passed, perform enrollment
                slot.enrolled.push(student._id);
                student.enrollments.push({ eventId: event._id, courseId: courseDetails.masterCourseId, courseTitle: courseDetails.masterCourseTitle, enrolledAt: new Date() });
                results.successes.push({ row: rowIndex, username, courseTitle: row.coursetitle });
            }
        }
        
        // Save all modified users and the event document once
        await event.save({ session });
        for (const user of userMap.values()) {
            if (user.isModified('enrollments')) {
                await user.save({ session });
            }
        }

        await session.commitTransaction();
        res.json({ success: true, data: results });

    } catch (err) {
        await session.abortTransaction();
        next(err);
    } finally {
        session.endSession();
    }
});
module.exports = router;