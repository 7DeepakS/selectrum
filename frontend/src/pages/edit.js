const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const Event = require('../models/Event');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

const csv = require('csv-parser');
const stream = require('stream');

// --- Multer Config ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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
const sendErrorResponse = (res, statusCode, message) => res.status(statusCode).json({ success: false, error: message });
const escapeCsvField = (field) => {
  if (field === null || typeof field === 'undefined') return '';
  const stringField = String(field);
  return stringField.includes(',') || stringField.includes('"') || stringField.includes('\n') ? `"${stringField.replace(/"/g, '""')}"` : stringField;
};

// =========================================================================
// --- STUDENT-FACING ROUTES ---
// =========================================================================

// GET /api/events - For StudentView
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const eventsFromDB = await Event.find({ isOpen: true }).lean();
    res.status(200).json({ success: true, data: eventsFromDB });
  } catch (err) { next(err); }
});

// GET /api/events/my-enrollment-status
router.get('/my-enrollment-status', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('enrollments').lean();
    if (!user) return sendErrorResponse(res, 404, 'User not found.');
    const enrollmentMap = {};
    (user.enrollments || []).forEach(e => { enrollmentMap[e.eventId.toString()] = e.courseTitle; });
    res.json({ success: true, data: { enrollments: enrollmentMap } });
  } catch (err) { next(err); }
});

// POST /api/events/:eventId/courses/:courseId/slots/:slotNumericId/enroll
router.post('/:eventId/courses/:courseId/slots/:slotNumericId/enroll', authMiddleware, authorizeRoles('student'), async (req, res, next) => {
  try {
    const { eventId, courseId, slotNumericId } = req.params;
    const student = await User.findById(req.user.id);
    if (!student) return sendErrorResponse(res, 404, 'Student not found.');
    
    const event = await Event.findById(eventId);
    if (!event) return sendErrorResponse(res, 404, 'Event not found.');
    if (!event.isOpen) return sendErrorResponse(res, 400, 'Event is closed for enrollment.');

    if ((student.enrollments || []).some(e => e.eventId.toString() === eventId)) {
      return sendErrorResponse(res, 400, 'You are already enrolled in a course for this event.');
    }
    
    const courseToEnroll = (event.courses || []).find(c => c._id.equals(courseId));
    if (!courseToEnroll) return sendErrorResponse(res, 404, 'Course not found.');
    const slotToEnroll = (courseToEnroll.slots || []).find(s => s.id === parseInt(slotNumericId, 10));
    if (!slotToEnroll) return sendErrorResponse(res, 404, 'Slot not found.');
    
    if (!slotToEnroll.isActive) return sendErrorResponse(res, 400, 'This slot is inactive.');
    if ((slotToEnroll.enrolled || []).length >= slotToEnroll.maxCapacity) {
        try { await new ActivityLog({ user: student._id, username: student.username, action: 'ENROLL_FAIL', details: { ip: req.ip, eventName: event.name, courseTitle: courseToEnroll.title, errorMessage: 'Slot is full' } }).save(); } catch (logError) { console.error(logError); }
        return sendErrorResponse(res, 400, 'This slot is full.');
    }
    
    slotToEnroll.enrolled.push(student._id);
    student.enrollments.push({ eventId: event._id, courseId: courseToEnroll._id, courseTitle: courseToEnroll.title });
    await Promise.all([event.save(), student.save()]);
    
    try { await new ActivityLog({ user: student._id, username: student.username, action: 'ENROLL_SUCCESS', details: { ip: req.ip, eventName: event.name, courseTitle: courseToEnroll.title } }).save(); } catch (logError) { console.error(logError); }
    
    res.json({ success: true, message: `Enrolled successfully!` });
  } catch (err) { next(err); }
});


// =========================================================================
// --- ADMIN-FACING MANAGEMENT & REPORTING ROUTES ---
// =========================================================================

// --- STATIC GET ROUTES (MUST BE DEFINED BEFORE PARAMETERIZED ONES) ---

// GET /api/events/all
router.get('/all', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const events = await Event.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, data: events });
    } catch(err) { next(err); }
});

// GET /api/events/activity-logs
router.get('/activity-logs', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const filter = {};
        if (req.query.username) { filter.username = { $regex: req.query.username, $options: 'i' }; }
        if (req.query.action) { filter.action = req.query.action; }
        const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name department').lean();
        const totalLogs = await ActivityLog.countDocuments(filter);
        res.json({ success: true, data: { logs, currentPage: page, totalPages: Math.ceil(totalLogs / limit), totalLogs } });
    } catch (err) { next(err); }
});

// GET /api/events/activity-logs/download
router.get('/activity-logs/download', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.username) { filter.username = { $regex: req.query.username, $options: 'i' }; }
        if (req.query.action) { filter.action = req.query.action; }
        const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).populate('user', 'name department').lean();
        if (logs.length === 0) {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', 'attachment; filename="activity_logs_empty.csv"');
            return res.status(200).send("Timestamp,Action,Username,User Name,User Department,Details\r\nNo data.");
        }
        const csvRows = [Object.keys(logs[0].details?._doc||{}).join(',')];
        const headers = ['Timestamp','Action','Username','User Name','User Department','Details'];
        const csvString = [headers.join(','),...logs.map(log=>{const d=[];if(log.details){if(log.details.ip)d.push(`IP: ${log.details.ip}`);if(log.details.eventName)d.push(`Event: ${log.details.eventName}`);if(log.details.courseTitle)d.push(`Course: ${log.details.courseTitle}`);if(log.details.errorMessage)d.push(`Error: ${log.details.errorMessage}`);} return [new Date(log.createdAt).toLocaleString(),log.action,log.username,log.user?log.user.name:'N/A',log.user?(log.user.department||'N/A'):'N/A',d.join('; ')].map(escapeCsvField).join(',');})].join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', 'attachment; filename="activity_logs.csv"');
        res.status(200).send(csvString);
    } catch (err) { next(err); }
});

// --- PARAMETERIZED GET ROUTES ---

// GET /api/events/:eventId
router.get('/:eventId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) return sendErrorResponse(res, 400, 'Invalid Event ID.');
        const event = await Event.findById(req.params.eventId).lean();
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        res.json({ success: true, data: event });
    } catch(err) { next(err); }
});

// GET /api/events/:eventId/enrollment-status-by-department
router.get('/:eventId/enrollment-status-by-department', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(eventId)) return sendErrorResponse(res, 400, 'Invalid Event ID.');
        const event = await Event.findById(eventId).select('name courses').lean();
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        const enrolledStudentsData = await Event.aggregate([ { $match: { _id: new mongoose.Types.ObjectId(eventId) } }, { $unwind: "$courses" }, { $unwind: "$courses.slots" }, { $unwind: "$courses.slots.enrolled" }, { $group: { _id: null, enrolledIds: { $addToSet: "$courses.slots.enrolled" } } }]);
        const enrolledStudentIds = new Set(enrolledStudentsData.length > 0 ? enrolledStudentsData[0].enrolledIds.map(id => id.toString()) : []);
        const allStudentsByDept = await User.aggregate([ { $match: { role: 'student' } }, { $group: { _id: { $ifNull: ["$department", "N/A"] }, students: { $push: { _id: "$_id" } }, totalStudentsInDept: { $sum: 1 } } }, { $project: { department: "$_id", students: 1, totalStudentsInDept: 1, _id: 0 } } ]);
        if (allStudentsByDept.length === 0) return res.json({ success: true, data: { eventName: event.name, eventId, departmentalStatus: [], message: "No students in system." } });
        const departmentalStatus = allStudentsByDept.map(d => { const e = d.students.filter(s => enrolledStudentIds.has(s._id.toString())).length; const t = d.totalStudentsInDept; return { department: d.department, total_students: t, signed_in_students: e, not_signed_in_students: t-e, percentage_signed_in: t>0?parseFloat(((e/t)*100).toFixed(2)):0};}).sort((a,b) => a.department.localeCompare(b.department));
        res.json({ success: true, data: { eventName: event.name, eventId, departmentalStatus } });
    } catch (err) { next(err); }
});

// POST /api/events - Create a new Event
router.post('/', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { name } = req.body;
        if (!name?.trim()) return sendErrorResponse(res, 400, 'Event name is required.');
        if (await Event.findOne({ name: name.trim() })) return sendErrorResponse(res, 400, `Event name "${name.trim()}" already exists.`);
        const event = new Event({ name: name.trim(), isOpen: false, courses: [] });
        await event.save();
        res.status(201).json({ success: true, data: event });
    } catch (err) { next(err); }
});

// PUT /api/events/:eventId - Update an Event's name or status
router.put('/:eventId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { name, isOpen } = req.body;
        if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) return sendErrorResponse(res, 400, 'Invalid Event ID.');
        const updateFields = {};
        if (name !== undefined) {
            if (!name?.trim()) return sendErrorResponse(res, 400, 'Event name cannot be empty.');
            updateFields.name = name.trim();
        }
        if (isOpen !== undefined) {
            if (typeof isOpen !== 'boolean') return sendErrorResponse(res, 400, 'isOpen must be a boolean.');
            updateFields.isOpen = isOpen;
        }
        if (Object.keys(updateFields).length === 0) return sendErrorResponse(res, 400, 'No fields to update provided.');
        
        const updatedEvent = await Event.findByIdAndUpdate(req.params.eventId, updateFields, { new: true, runValidators: true });
        if (!updatedEvent) return sendErrorResponse(res, 404, 'Event not found.');
        res.json({ success: true, message: 'Event updated successfully.', data: updatedEvent });
    } catch (err) { next(err); }
});

// DELETE /api/events/:eventId - Delete an entire Event
router.delete('/:eventId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(eventId)) return sendErrorResponse(res, 400, 'Invalid Event ID.');
        const eventToDelete = await Event.findByIdAndDelete(eventId);
        if (!eventToDelete) return sendErrorResponse(res, 404, 'Event not found.');
        await User.updateMany({ "enrollments.eventId": eventId }, { $pull: { enrollments: { eventId: eventId } } });
        res.json({ success: true, message: `Event "${eventToDelete.name}" was permanently deleted.` });
    } catch (err) { next(err); }
});

// POST /api/events/:eventId/courses - Add a new course to an event
router.post('/:eventId/courses', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const { title, description, slots } = req.body;
        if (!title?.trim()) return sendErrorResponse(res, 400, 'Course title is required.');
        if (!slots || !Array.isArray(slots) || slots.length === 0) return sendErrorResponse(res, 400, 'At least one slot is required.');
        
        const event = await Event.findById(eventId);
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');

        const newCourse = {
            _id: new mongoose.Types.ObjectId(), title: title.trim(), description: description || '',
            slots: slots.map((s, i) => ({ ...s, _id: new mongoose.Types.ObjectId(), id: s.id || i + 1 })),
        };
        event.courses.push(newCourse);
        await event.save();
        res.status(201).json({ success: true, message: 'Course added successfully.', data: newCourse });
    } catch (err) { next(err); }
});

router.put('/:eventId/courses/:courseId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId, courseId } = req.params;
        const { title, description, slots } = req.body; // The new data from the form

        if (!title?.trim()) return sendErrorResponse(res, 400, 'Course title is required.');
        if (!slots || !Array.isArray(slots) || slots.length === 0) {
            return sendErrorResponse(res, 400, 'Course must have at least one slot.');
        }

        const event = await Event.findById(eventId);
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');

        // Find the specific course within the event's courses array
        const courseToUpdate = event.courses.id(courseId);
        if (!courseToUpdate) return sendErrorResponse(res, 404, 'Course not found within this event.');
        
        // Update the fields
        courseToUpdate.title = title.trim();
        courseToUpdate.description = description || '';
        // Completely replace the old slots with the new slots array from the frontend
        // We generate new ObjectIDs for each slot to ensure they are fresh.
        courseToUpdate.slots = slots.map((s, i) => ({
            _id: new mongoose.Types.ObjectId(),
            id: s.id || i + 1, // Keep original numeric ID if it exists
            time: new Date(s.time),
            maxCapacity: parseInt(s.maxCapacity, 10),
            isActive: s.isActive !== undefined ? s.isActive : true,
            // IMPORTANT: We must preserve existing enrollments if a slot's ID is kept.
            // This is a complex operation. For simplicity now, we assume editing slots clears them.
            // A more advanced implementation would match old slots to new ones and carry over enrollments.
            enrolled: [] 
        }));

        await event.save();

        // Also update the courseTitle in any user's enrollment record
        await User.updateMany(
            { "enrollments.courseId": courseId },
            { "$set": { "enrollments.$.courseTitle": title.trim() } }
        );

        res.json({ success: true, message: 'Course updated successfully.', data: courseToUpdate });

    } catch(err) {
        console.error(`Error updating course ${req.params.courseId}:`, err.stack);
        next(err);
    }
});

// DELETE /api/events/:eventId/courses/:courseId - Delete a course from an event
router.delete('/:eventId/courses/:courseId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId, courseId } = req.params;
        const event = await Event.findById(eventId);
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        
        const courseToDelete = (event.courses || []).find(c => c._id.equals(courseId));
        if (!courseToDelete) return sendErrorResponse(res, 404, 'Course not found in this event.');
        
        const studentIdsInCourse = new Set();
        (courseToDelete.slots || []).forEach(s => s.enrolled.forEach(id => studentIdsInCourse.add(id)));
        if (studentIdsInCourse.size > 0) {
            await User.updateMany({ _id: { $in: Array.from(studentIdsInCourse) } }, { $pull: { enrollments: { courseId: courseToDelete._id } } });
        }
        
        event.courses.pull({ _id: courseId });
        await event.save();
        
        res.json({ success: true, message: 'Course deleted and associated enrollments removed.' });
    } catch (err) { next(err); }
});

// PUT /api/events/:eventId/courses/:courseId (The missing route)
router.put('/:eventId/courses/:courseId', authMiddleware, authorizeRoles('admin'), async (req, res, next) => {
    try {
        const { eventId, courseId } = req.params;
        const { title, description, slots } = req.body;
        if (!title?.trim()) return sendErrorResponse(res, 400, 'Course title is required.');
        if (!slots || !Array.isArray(slots) || slots.length === 0) return sendErrorResponse(res, 400, 'A course must have at least one slot.');
        
        const event = await Event.findById(eventId);
        if (!event) return sendErrorResponse(res, 404, 'Event not found.');
        const course = event.courses.id(courseId);
        if (!course) return sendErrorResponse(res, 404, 'Course not found in this event.');
        
        course.title = title.trim();
        course.description = description || '';
        course.slots = slots.map((s, i) => ({ ...s, _id: s._id || new mongoose.Types.ObjectId(), id: s.id || i + 1, enrolled: [] }));
        
        await event.save();
        await User.updateMany({ "enrollments.courseId": courseId }, { "$set": { "enrollments.$.courseTitle": title.trim() } });
        res.json({ success: true, message: 'Course updated successfully.', data: course });
    } catch(err) { next(err); }
});

router.post('/upload-students', authMiddleware, authorizeRoles('admin'), upload.single('csv'), async (req, res, next) => { 
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
module.exports = router;