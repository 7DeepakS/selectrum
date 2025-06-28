const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer'); // <-- IMPORTED multer
const Event = require('../models/Event');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

const csv = require('csv-parser');
const stream = require('stream');
const bcrypt = require('bcryptjs');

// --- Configure Multer specifically for this router ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      const err = new Error('Invalid file type. Only CSV files are allowed.');
      err.statusCode = 400; // So the global handler sends a 400 Bad Request
      cb(err, false);
    }
  }
});

const sendErrorResponse = (res, statusCode, message, details = null) => {
  res.status(statusCode).json({ success: false, error: message, details });
};

const escapeCsvField = (field) => {
  if (field === null || typeof field === 'undefined') return '';
  const stringField = String(field);
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n') || stringField.includes('\r')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
};

// GET /api/events
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const eventsFromDB = await Event.find().lean();
    const userId = req.user.id; 

    const enrichedEvents = eventsFromDB.map(event => {
      let isUserEnrolledInThisEventOverall = false;
      const processedCourses = (event.courses || []).map(course => {
        const processedSlots = (course.slots || []).map(slot => {
          const isUserEnrolledInThisSpecificSlot = Array.isArray(slot.enrolled) && 
            userId && 
            slot.enrolled.some(enrolledUserId => enrolledUserId.equals(userId));
            
          if (isUserEnrolledInThisSpecificSlot) {
            isUserEnrolledInThisEventOverall = true;
          }
          return { ...slot, isEnrolled: isUserEnrolledInThisSpecificSlot, availableCapacity: slot.maxCapacity - (Array.isArray(slot.enrolled) ? slot.enrolled.length : 0) };
        });
        return { ...course, slots: processedSlots };
      });
      return { ...event, courses: processedCourses, isEnrolledInEvent: isUserEnrolledInThisEventOverall };
    });
    res.status(200).json({ success: true, data: enrichedEvents });
  } catch (err) {
    console.error('Error fetching events:', err.stack);
    next(err); // Pass to global error handler
  }
});

// POST /api/events
router.post('/', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { name, isOpen = false } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return sendErrorResponse(res, 400, 'Event name is required and must be a non-empty string.');
    }
    if (req.body.title || req.body.slots) {
        return sendErrorResponse(res, 400, 'Event creation does not accept "title" or "slots" directly. Add courses via the dedicated endpoint.');
    }
    const existingEvent = await Event.findOne({ name: name.trim() });
    if (existingEvent) {
        return sendErrorResponse(res, 400, `Event with name "${name.trim()}" already exists.`);
    }
    const event = new Event({ name: name.trim(), isOpen, courses: [] });
    await event.save();
    res.status(201).json({ success: true, data: event });
  } catch (err) {
    console.error('Error creating event:', err.stack);
    next(err);
  }
});

// POST /api/events/toggle/:eventId
router.post('/toggle/:eventId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { isOpen } = req.body;
    if (typeof isOpen !== 'boolean') {
      return sendErrorResponse(res, 400, 'isOpen must be a boolean value (true or false).');
    }
    const event = await Event.findById(eventId);
    if (!event) return sendErrorResponse(res, 404, 'Event not found.');
    event.isOpen = isOpen;
    await event.save();
    res.json({ success: true, message: 'Event status updated successfully.', data: { _id: event._id, isOpen: event.isOpen } });
  } catch (err) {
    console.error('Error toggling event:', err.stack);
    next(err);
  }
});

// POST /api/events/:eventId/courses
router.post('/:eventId/courses', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { title, description, slots } = req.body;
    if (!title || !title.trim() || !slots || !Array.isArray(slots) || slots.length === 0) {
      return sendErrorResponse(res, 400, 'Course title and at least one slot are required.');
    }
    for (const slot of slots) {
        if (!slot.time || isNaN(new Date(slot.time).getTime())) { return sendErrorResponse(res, 400, 'Invalid time provided for one or more slots.'); }
        if (slot.maxCapacity === undefined || slot.maxCapacity === null || parseInt(slot.maxCapacity, 10) < 1) { return sendErrorResponse(res, 400, 'Max capacity must be a positive number for all slots.'); }
    }
    const event = await Event.findById(eventId);
    if (!event) return sendErrorResponse(res, 404, 'Event not found to add course to.');

    const newCourse = {
      _id: new mongoose.Types.ObjectId(),
      title: title.trim(),
      description: description ? description.trim() : '',
      slots: slots.map((slot, index) => ({
        _id: new mongoose.Types.ObjectId(),
        id: slot.id || (index + 1),
        time: new Date(slot.time),
        maxCapacity: parseInt(slot.maxCapacity, 10),
        enrolled: [],
        isActive: slot.isActive !== undefined ? slot.isActive : true,
      })),
    };
    event.courses.push(newCourse);
    await event.save();
    const addedCourse = event.courses.find(c => c._id.equals(newCourse._id));
    res.status(201).json({ success: true, message: 'Course added successfully.', data: addedCourse });
  } catch (err) {
    console.error('Error adding course:', err.stack);
    next(err);
  }
});

// POST /api/events/:eventId/courses/:courseId/slots/:slotNumericId/enroll
router.post('/:eventId/courses/:courseId/slots/:slotNumericId/enroll', authMiddleware, authorizeRoles('student'), async (req, res, next) => {
  try {
    const { eventId, courseId, slotNumericId } = req.params;
    const numericSlotIdParsed = parseInt(slotNumericId, 10);
    const student = await User.findById(req.user.id);
    if (!student) { return sendErrorResponse(res, 404, 'Student (user) not found.'); }
    const event = await Event.findById(eventId);
    if (!event) { return sendErrorResponse(res, 404, 'Event not found.'); }
    if (!event.isOpen) { return sendErrorResponse(res, 400, 'Event is closed for enrollment.'); }

    const isAlreadyEnrolledInThisEvent = (event.courses || []).some(course =>
      (course.slots || []).some(slot =>
        (slot.enrolled || []).some(enrolledUserId => enrolledUserId.equals(student._id))
      )
    );
    if (isAlreadyEnrolledInThisEvent) { return sendErrorResponse(res, 400, `You are already enrolled in a course for this event. You can only choose one.`); }

    const courseToEnroll = (event.courses || []).find(c => c._id.equals(courseId));
    if (!courseToEnroll) { return sendErrorResponse(res, 404, 'Course not found within the event.'); }

    const slotToEnroll = (courseToEnroll.slots || []).find(s => s.id === numericSlotIdParsed);
    if (!slotToEnroll) { return sendErrorResponse(res, 404, 'Slot not found within the course.'); }

    if (!slotToEnroll.isActive) { return sendErrorResponse(res, 400, 'This slot is currently inactive.'); }

    if ((slotToEnroll.enrolled || []).length >= slotToEnroll.maxCapacity) {
        try {
            const logEntry = new ActivityLog({
                user: student._id, username: student.username, action: 'ENROLL_FAIL',
                details: { ip: req.ip, event: event._id, eventName: event.name, courseTitle: courseToEnroll.title, slotNumericId: slotToEnroll.id, errorMessage: 'Slot is full' }
            });
            await logEntry.save();
        } catch (logError) { console.error('Failed to save ENROLL_FAIL activity log:', logError); }
        return sendErrorResponse(res, 400, 'This slot is full.');
    }

    if (!Array.isArray(slotToEnroll.enrolled)) { slotToEnroll.enrolled = []; }
    slotToEnroll.enrolled.push(student._id);
    student.selectedEvent = event._id;
    await Promise.all([event.save(), student.save()]);

    try {
        const logEntry = new ActivityLog({
            user: student._id, username: student.username, action: 'ENROLL_SUCCESS',
            details: { ip: req.ip, event: event._id, eventName: event.name, courseTitle: courseToEnroll.title, slotNumericId: slotToEnroll.id }
        });
        await logEntry.save();
    } catch (logError) { console.error('Failed to save ENROLL_SUCCESS activity log:', logError); }

    res.json({ success: true, message: `Enrolled successfully in ${courseToEnroll.title}!` });
  } catch (err) {
    console.error('ENROLLMENT_ERROR:', err.stack);
    next(err);
  }
});

// POST /api/events/add-student
router.post('/add-student', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
      const { username, name, password, department } = req.body;
      if (!username || !username.trim() || !name || !name.trim() || !password) { return sendErrorResponse(res, 400, 'Username, name, and password are required.'); }
      const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
      if (existingUser) { return sendErrorResponse(res, 400, `User with username "${username.trim()}" already exists.`); }
      const user = new User({
          username: username.trim().toLowerCase(), name: name.trim(), role: 'student', password, 
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

// POST /api/events/upload-students
router.post(
  '/upload-students', 
  authMiddleware, 
  authorizeRoles('admin'), 
  upload.single('csv'), // APPLY middleware directly to this route
  async (req, res, next) => {
    try {
        if (!req.file) {
            return sendErrorResponse(res, 400, 'No CSV file was uploaded. Ensure the file is sent with the key "csv".');
        }
    
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
                    const { username, name, password, department } = {
                        username: row.username ? row.username.trim() : null,
                        name: row.name ? row.name.trim() : null,
                        password: row.password, 
                        department: row.department ? row.department.trim() : null
                    };
                    if (!username || !name || !password) {
                        errors.push({ row: rowIndex, student: username || 'N/A', error: 'Missing required fields: username, name, or password.' });
                        continue;
                    }
                    try {
                        const existingUser = await User.findOne({ username: username.toLowerCase() });
                        if (existingUser) {
                            errors.push({ row: rowIndex, student: username, error: `Username already exists.` });
                            continue;
                        }
                        const newUser = new User({ username: username.toLowerCase(), name, password, role: 'student', department });
                        await newUser.save();
                        createdCount++;
                    } catch (dbError) {
                        errors.push({ row: rowIndex, student: username, error: `Database error: ${dbError.message}` });
                    }
                }
                if (errors.length > 0 && createdCount === 0) {
                    return sendErrorResponse(res, 400, `CSV processing failed. All ${errors.length} rows had errors.`, { errors });
                }
                if (errors.length > 0) {
                    return res.status(207).json({ success: true, message: `Partial success: ${createdCount} students created, ${errors.length} rows failed.`, createdCount, errors });
                }
                res.json({ success: true, message: `All ${createdCount} students from CSV uploaded successfully.`, createdCount });
            } catch (processError) {
                next(processError);
            }
          })
          .on('error', (streamError) => {
              streamError.statusCode = 400;
              next(streamError);
          });
    } catch(err) {
        next(err);
    }
});

// GET /api/events/enrollment-summary/by-department
router.get('/enrollment-summary/by-department', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
      const summary = await Event.aggregate([
        { $match: { "courses.0": { "$exists": true } } }, 
        { $unwind: "$courses" },
        { $match: { "courses.slots.0": { "$exists": true } } }, 
        { $unwind: "$courses.slots" },
        { $match: { "courses.slots.enrolled.0": { "$exists": true } } }, 
        { $unwind: "$courses.slots.enrolled" },
        { $lookup: { from: "users", localField: "courses.slots.enrolled", foreignField: "_id", as: "enrolledStudentInfo" } },
        { $unwind: "$enrolledStudentInfo" },
        { $group: { _id: { department: { $ifNull: ["$enrolledStudentInfo.department", "N/A"] } }, enrollmentCount: { $sum: 1 } } },
        { $project: { _id: 0, department: "$_id.department", totalEnrollments: "$enrollmentCount" } },
        { $sort: { department: 1 } }
      ]);
  
      const distinctDepartmentsFromUsers = await User.distinct("department", { department: { $ne: null, $ne: "" } });
      const departmentsWithEnrollments = new Set(summary.map(s => s.department));
      let finalDistinctDepartments = [...new Set([...distinctDepartmentsFromUsers, ...departmentsWithEnrollments])].filter(dept => dept != null);
  
      res.json({ success: true, data: { summary, distinctDepartments: finalDistinctDepartments.sort() } });
    } catch (err) {
      console.error('Error fetching enrollment summary by department:', err.stack);
      next(err);
    }
});

// POST /api/events/download/custom-detailed
router.post('/download/custom-detailed', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { scope, columns } = req.body; 
        if (!scope || !scope.type || !Array.isArray(columns) || columns.length === 0) {
            return sendErrorResponse(res, 400, 'Report scope and selected columns are required.');
        }
        
        const columnDefinitions = {
            eventName: { header: 'Event Name', getValue: (e,c,s,st) => e.name||'N/A' },
            eventIsOpen: { header: 'Event Open', getValue: (e,c,s,st) => e.isOpen ? 'Yes':'No' },
            courseTitle: { header: 'Course Title', getValue: (e,c,s,st) => c.title||'N/A' },
            courseDescription: { header: 'Course Description', getValue: (e,c,s,st) => c.description||'' },
            slotTime: { header: 'Slot Time', getValue: (e,c,s,st) => s.time ? new Date(s.time).toLocaleString() : 'N/A' },
            slotMaxCapacity: { header: 'Slot Max Capacity', getValue: (e,c,s,st) => s.maxCapacity },
            slotIsActive: { header: 'Slot Is Active', getValue: (e,c,s,st) => s.isActive ? 'Yes':'No' },
            studentName: { header: 'Student Name', getValue: (e,c,s,st) => st ? (st.name||'N/A') : '' },
            studentUsername: { header: 'Student Username', getValue: (e,c,s,st) => st ? (st.username||'N/A') : '' },
            studentDepartment: { header: 'Student Department', getValue: (e,c,s,st) => st ? (st.department||'N/A') : '' },
        };
        const activeColumnDefinitions = columns.map(key => ({ key, ...columnDefinitions[key] })).filter(def => def.header); 
        if (activeColumnDefinitions.length === 0) { return sendErrorResponse(res, 400, 'No valid columns selected.'); }

        let mongoQuery = {};
        if (scope.type === 'event' || scope.type === 'course') {
            const idToQuery = scope.type === 'event' ? scope.value : scope.eventId;
            if (!mongoose.Types.ObjectId.isValid(idToQuery)) { return sendErrorResponse(res, 400, 'Invalid Event ID.'); }
            mongoQuery._id = idToQuery;
        }
        if (scope.type === 'course' && !mongoose.Types.ObjectId.isValid(scope.courseId)) { return sendErrorResponse(res, 400, 'Invalid Course ID.'); }

        const events = await Event.find(mongoQuery).populate({ path: 'courses.slots.enrolled', model: 'User', select: 'username name department' }).lean();
        let reportDataRows = [];
        let scopeDesc = scope.type;

        events.forEach(event => {
            (event.courses || []).forEach(course => {
                if (scope.type === 'course' && course._id.toString() !== scope.courseId) return;
                if(scope.type !== 'department') scopeDesc = `${event.name}_${course.title}`;

                (course.slots || []).forEach(slot => {
                    if ((slot.enrolled || []).length > 0) {
                        slot.enrolled.forEach(student => {
                            let matches = scope.type !== 'department' || scope.value === 'all' || (student.department || 'N/A') === scope.value;
                            if (matches) {
                                const row = {};
                                activeColumnDefinitions.forEach(def => { row[def.key] = def.getValue(event, course, slot, student); });
                                reportDataRows.push(row);
                            }
                        });
                    } else if (scope.type !== 'department' || scope.value === 'all') {
                        if (activeColumnDefinitions.some(def => !def.key.startsWith('student'))) {
                             const row = {};
                             activeColumnDefinitions.forEach(def => { row[def.key] = def.getValue(event, course, slot, null); });
                             reportDataRows.push(row);
                        }
                    }
                });
            });
        });
        
        const safeScopeDesc = scopeDesc.replace(/[^\w-]/g, '_').substring(0, 50);
        if (reportDataRows.length === 0) {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="report_${safeScopeDesc}_empty.csv"`);
            const header = activeColumnDefinitions.map(d => d.header).map(escapeCsvField).join(',');
            return res.status(200).send(`${header}\r\nNo data found.`);
        }
        
        // Sorting logic here...

        let csvRows = [];
        csvRows.push(activeColumnDefinitions.map(d => d.header).map(escapeCsvField).join(','));
        reportDataRows.forEach(row => {
            csvRows.push(activeColumnDefinitions.map(def => row[def.key] || '').map(escapeCsvField).join(','));
        });
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="report_${safeScopeDesc}.csv"`);
        res.status(200).send(csvRows.join('\r\n'));
    } catch (err) {
        console.error(`Error generating custom CSV:`, err.stack);
        next(err);
    }
});

// GET /api/events/:eventId/enrollment-status
router.get('/:eventId/enrollment-status', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const departmentQuery = req.query.department; 
        if (!mongoose.Types.ObjectId.isValid(eventId)) { return sendErrorResponse(res, 400, 'Invalid Event ID.'); }
        const event = await Event.findById(eventId).lean();
        if (!event) { return sendErrorResponse(res, 404, 'Event not found.'); }
        let studentFilter = { role: 'student' };
        if (departmentQuery && departmentQuery.toLowerCase() !== 'all') {
            if (departmentQuery.toLowerCase() === 'n/a') { studentFilter.department = { $in: [null, ""] }; }
            else { studentFilter.department = decodeURIComponent(departmentQuery); }
        }
        const allPotentialStudents = await User.find(studentFilter).select('_id name username department').lean();
        if (allPotentialStudents.length === 0 && departmentQuery && departmentQuery.toLowerCase() !== 'all') {
             return res.json({ success: true, data: { eventName: event.name, eventId: event._id, filterDepartment: departmentQuery, studentsWhoSelected: [], studentsNotYetSelected: [], countSelected: 0, countNotSelected: 0, totalPotentialInFilter: 0, message: `No students found matching the department filter: "${departmentQuery}"`} });
        }
        const enrolledStudentIdsInThisEvent = new Set();
        (event.courses || []).forEach(c => (c.slots || []).forEach(s => (s.enrolled || []).forEach(id => enrolledStudentIdsInThisEvent.add(id.toString()))));
        const studentsWhoSelected = []; const studentsNotYetSelected = [];
        allPotentialStudents.forEach(student => {
            const studentInfo = { _id: student._id, name: student.name, username: student.username, department: student.department || "N/A" };
            if (enrolledStudentIdsInThisEvent.has(student._id.toString())) { studentsWhoSelected.push(studentInfo); }
            else { studentsNotYetSelected.push(studentInfo); }
        });
        res.json({ success: true, data: { eventName: event.name, eventId: event._id, filterDepartment: departmentQuery || 'all', studentsWhoSelected, studentsNotYetSelected, countSelected: studentsWhoSelected.length, countNotSelected: studentsNotYetSelected.length, totalPotentialInFilter: allPotentialStudents.length } });
    } catch (err) {
        console.error(`Error fetching enrollment status for event ${eventId}:`, err.stack);
        next(err);
    }
});

// ======================== NEW ROUTES FOR ACTIVITY LOGS ========================

// GET /api/events/activity-logs
router.get('/activity-logs', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.username) { filter.username = { $regex: req.query.username, $options: 'i' }; }
        if (req.query.action) { filter.action = req.query.action; }

        const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
            .populate('user', 'name department').lean();

        const totalLogs = await ActivityLog.countDocuments(filter);
        const totalPages = Math.ceil(totalLogs / limit);

        res.json({ success: true, data: { logs, currentPage: page, totalPages, totalLogs } });
    } catch (err) {
        console.error('Error fetching activity logs:', err.stack);
        next(err);
    }
});

// GET /api/events/activity-logs/download
router.get('/activity-logs/download', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.username) { filter.username = { $regex: req.query.username, $options: 'i' }; }
        if (req.query.action) { filter.action = req.query.action; }

        const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).populate('user', 'name department').lean();

        if (logs.length === 0) {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="activity_logs_empty.csv"');
            return res.status(200).send("Timestamp,Action,Username,User Name,User Department,Details\r\nNo activity logs found for selected criteria.");
        }

        const csvRows = [];
        csvRows.push(['Timestamp', 'Action', 'Username', 'User Name', 'User Department', 'Details'].map(escapeCsvField).join(','));

        for (const log of logs) {
            const detailsArray = [];
            if (log.details) {
                if (log.details.ip) detailsArray.push(`IP: ${log.details.ip}`);
                if (log.details.eventName) detailsArray.push(`Event: ${log.details.eventName}`);
                if (log.details.courseTitle) detailsArray.push(`Course: ${log.details.courseTitle}`);
                if (log.details.errorMessage) detailsArray.push(`Error: ${log.details.errorMessage}`);
            }
            csvRows.push([
                new Date(log.createdAt).toLocaleString(), log.action, log.username,
                log.user ? log.user.name : 'N/A', log.user ? (log.user.department || 'N/A') : 'N/A',
                detailsArray.join('; ')
            ].map(escapeCsvField).join(','));
        }

        const csvString = csvRows.join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="activity_logs.csv"');
        res.status(200).send(csvString);
    } catch (err) {
        console.error('Error downloading activity logs:', err.stack);
        next(err);
    }
});

module.exports = router;