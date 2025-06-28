// backend/routes/events.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Event = require('../models/Event'); // Ensure this path is correct
const User = require('../models/User');   // Ensure this path is correct
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware'); // Ensure this path is correct

// For CSV processing
const csv = require('csv-parser');
const stream = require('stream');
const bcrypt = require('bcryptjs'); // For hashing passwords from CSV

// Helper for consistent error responses
const sendErrorResponse = (res, statusCode, message, details = null) => {
  res.status(statusCode).json({ success: false, error: message, details });
};

// Helper to escape CSV data
const escapeCsvField = (field) => {
  if (field === null || typeof field === 'undefined') return '';
  const stringField = String(field);
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n') || stringField.includes('\r')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
};

// GET /api/events - Get all events (enriched for the logged-in user)
router.get('/', authMiddleware, async (req, res) => {
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
          return {
            ...slot,
            isEnrolled: isUserEnrolledInThisSpecificSlot,
            availableCapacity: slot.maxCapacity - (Array.isArray(slot.enrolled) ? slot.enrolled.length : 0),
          };
        });
        return { ...course, slots: processedSlots };
      });
      return { ...event, courses: processedCourses, isEnrolledInEvent: isUserEnrolledInThisEventOverall };
    });

    res.status(200).json({ success: true, data: enrichedEvents });
  } catch (err) {
    console.error('Error fetching events:', err.stack);
    sendErrorResponse(res, 500, 'Failed to fetch events.');
  }
});

// POST /api/events - Create a new event (Admin only)
// ... (This route remains the same as previous full code version)
router.post('/', authMiddleware, authorizeRoles('admin'), async (req, res) => {
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
    if (err.name === 'ValidationError') {
        return sendErrorResponse(res, 400, 'Validation Error', Object.values(err.errors).map(e => e.message));
    }
    sendErrorResponse(res, 500, 'Failed to create event.');
  }
});


// POST /api/events/toggle/:eventId - Toggle event open/closed status (Admin only)
// ... (This route remains the same)
router.post('/toggle/:eventId', authMiddleware, authorizeRoles('admin'), async (req, res) => {
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
    sendErrorResponse(res, 500, 'Failed to toggle event status.');
  }
});

// POST /api/events/:eventId/courses - Add a course to an event (Admin only)
// ... (This route remains the same)
router.post('/:eventId/courses', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { title, description, slots } = req.body;
    if (!title || !title.trim() || !slots || !Array.isArray(slots) || slots.length === 0) {
      return sendErrorResponse(res, 400, 'Course title and at least one slot are required.');
    }
    for (const slot of slots) {
        if (!slot.time || isNaN(new Date(slot.time).getTime())) {
            return sendErrorResponse(res, 400, 'Invalid time provided for one or more slots.');
        }
        if (slot.maxCapacity === undefined || slot.maxCapacity === null || parseInt(slot.maxCapacity, 10) < 1) {
            return sendErrorResponse(res, 400, 'Max capacity must be a positive number for all slots.');
        }
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
    if (err.name === 'ValidationError') {
        return sendErrorResponse(res, 400, 'Validation Error', Object.values(err.errors).map(e => e.message));
    }
    sendErrorResponse(res, 500, 'Failed to add course.');
  }
});

// POST /api/events/:eventId/courses/:courseId/slots/:slotNumericId/enroll - Enroll in a slot
// ... (This route remains the same)
router.post('/:eventId/courses/:courseId/slots/:slotNumericId/enroll', authMiddleware, authorizeRoles('student'), async (req, res) => {
  console.log(`ENROLLMENT: Attempt by user ${req.user.username} for event ${req.params.eventId}, course ${req.params.courseId}, slot ${req.params.slotNumericId}`);
  try {
    const { eventId, courseId, slotNumericId } = req.params;
    const numericSlotIdParsed = parseInt(slotNumericId, 10);

    const student = await User.findById(req.user.id);
    if (!student) {
        console.log(`ENROLLMENT_FAIL: Student ${req.user.id} not found.`);
        return sendErrorResponse(res, 404, 'Student (user) not found.');
    }

    const event = await Event.findById(eventId);
    if (!event) {
        console.log(`ENROLLMENT_FAIL: Event ${eventId} not found.`);
        return sendErrorResponse(res, 404, 'Event not found.');
    }
    if (!event.isOpen) {
        console.log(`ENROLLMENT_FAIL: Event ${eventId} is closed.`);
        return sendErrorResponse(res, 400, 'Event is closed for enrollment.');
    }

    let isAlreadyEnrolledInThisEvent = false;
    let enrolledCourseTitleInThisEvent = null;
    for (const course of (event.courses || [])) {
      for (const slot of (course.slots || [])) {
        if (Array.isArray(slot.enrolled) && slot.enrolled.some(enrolledUserId => enrolledUserId.equals(student._id))) {
          isAlreadyEnrolledInThisEvent = true;
          enrolledCourseTitleInThisEvent = course.title;
          break;
        }
      }
      if (isAlreadyEnrolledInThisEvent) break;
    }

    if (isAlreadyEnrolledInThisEvent) {
      const targetCourseForCheck = (event.courses || []).find(c => c._id.equals(courseId));
      const targetSlotForCheck = targetCourseForCheck ? (targetCourseForCheck.slots || []).find(s => s.id === numericSlotIdParsed) : null;
      
      if (targetSlotForCheck && Array.isArray(targetSlotForCheck.enrolled) && targetSlotForCheck.enrolled.some(enrolledUserId => enrolledUserId.equals(student._id))) {
        console.log(`ENROLLMENT_FAIL: User ${student.username} already in this specific slot.`);
        return sendErrorResponse(res, 400, `You are already enrolled in this specific slot: ${targetCourseForCheck.title}.`);
      }
      console.log(`ENROLLMENT_FAIL: User ${student.username} already in course "${enrolledCourseTitleInThisEvent}" for event ${event.name}.`);
      return sendErrorResponse(res, 400, `You are already enrolled in "${enrolledCourseTitleInThisEvent}" for this event. You can only enroll in one course per event.`);
    }

    const courseToEnroll = (event.courses || []).find(c => c._id.equals(courseId));
    if (!courseToEnroll) {
        console.log(`ENROLLMENT_FAIL: Course ${courseId} not found in event ${event.name}.`);
        return sendErrorResponse(res, 404, 'Course not found within the event.');
    }

    const slotToEnroll = (courseToEnroll.slots || []).find(s => s.id === numericSlotIdParsed);
    if (!slotToEnroll) {
        console.log(`ENROLLMENT_FAIL: Slot ${numericSlotIdParsed} not found in course ${courseToEnroll.title}.`);
        return sendErrorResponse(res, 404, 'Slot not found within the course.');
    }

    if (!slotToEnroll.isActive) {
        console.log(`ENROLLMENT_FAIL: Slot ${slotToEnroll.id} in course ${courseToEnroll.title} is inactive.`);
        return sendErrorResponse(res, 400, 'This slot is currently inactive.');
    }
    if (Array.isArray(slotToEnroll.enrolled) && slotToEnroll.enrolled.length >= slotToEnroll.maxCapacity) {
        console.log(`ENROLLMENT_FAIL: Slot ${slotToEnroll.id} in course ${courseToEnroll.title} is full.`);
        return sendErrorResponse(res, 400, 'This slot is full.');
    }

    if (!Array.isArray(slotToEnroll.enrolled)) { 
        slotToEnroll.enrolled = [];
    }
    slotToEnroll.enrolled.push(student._id);
    student.selectedEvent = event._id;

    await Promise.all([event.save(), student.save()]);
    console.log(`ENROLLMENT_SUCCESS: User ${student.username} enrolled in event ${event.name}, course ${courseToEnroll.title}, slot ${slotToEnroll.id}`);
    res.json({ success: true, message: `Enrolled successfully in ${courseToEnroll.title}!` });

  } catch (err) {
    console.error('ENROLLMENT_ERROR: General error during enrollment:', err.stack);
    sendErrorResponse(res, 500, 'Enrollment failed due to a server error.');
  }
});

// POST /api/events/add-student
// ... (This route remains the same)
router.post('/add-student', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const { username, name, password, department } = req.body;
     if (!username || !username.trim() || !name || !name.trim() || !password) {
        return sendErrorResponse(res, 400, 'Username, name, and password are required.');
    }
    const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
    if (existingUser) {
        return sendErrorResponse(res, 400, `User with username "${username.trim()}" already exists.`);
    }
    
    const user = new User({
        username: username.trim().toLowerCase(),
        name: name.trim(),
        role: 'student',
        password, 
        department: department ? department.trim() : null 
    });
    await user.save(); // Assumes pre-save hook in User model hashes password
    const userResponse = { _id: user._id, username: user.username, name: user.name, role: user.role, department: user.department };
    res.status(201).json({ success: true, message: 'Student added successfully.', data: userResponse });
  } catch (err) {
    console.error('Error adding student:', err.stack);
    if (err.name === 'ValidationError') {
        return sendErrorResponse(res, 400, 'Validation Error', Object.values(err.errors).map(e => e.message));
    }
    sendErrorResponse(res, 500, 'Failed to add student.');
  }
});

// POST /api/events/upload-students - Upload students via CSV
// ... (This route remains the same)
router.post('/upload-students', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0 || !req.files.csv) {
    return sendErrorResponse(res, 400, 'No CSV file uploaded.');
  }

  const csvFile = req.files.csv;
  const studentDataFromCsv = [];
  const errors = [];
  let createdCount = 0;

  const readableFileStream = new stream.Readable();
  readableFileStream.push(csvFile.data);
  readableFileStream.push(null);

  readableFileStream
    .pipe(csv({
        mapHeaders: ({ header }) => header.trim().toLowerCase(),
        skipComments: true,
    }))
    .on('data', (row) => {
      studentDataFromCsv.push(row);
    })
    .on('end', async () => {
      for (let i = 0; i < studentDataFromCsv.length; i++) {
        const row = studentDataFromCsv[i];
        const rowIndex = i + 2; 
        
        const username = row.username ? row.username.trim() : null;
        const name = row.name ? row.name.trim() : null;
        const password = row.password; 
        const department = row.department ? row.department.trim() : null;

        if (!username || !name || !password) {
          errors.push({ row: rowIndex, student: username || 'N/A', error: 'Missing required fields (username, name, password).' });
          continue;
        }

        try {
          const existingUser = await User.findOne({ username: username.toLowerCase() });
          if (existingUser) {
            errors.push({ row: rowIndex, student: username, error: `User already exists.` });
            continue;
          }
          
          const newUser = new User({
            username: username.toLowerCase(),
            name,
            password: password, 
            role: 'student',
            department: department || null
          });
          await newUser.save(); // Assumes pre-save hook in User model hashes password
          createdCount++;
        } catch (dbError) {
          errors.push({ row: rowIndex, student: username, error: `Database error: ${dbError.message}` });
        }
      }

      if (errors.length > 0 && createdCount === 0) {
         return sendErrorResponse(res, 400, `CSV processing failed. ${errors.length} rows had errors. No students created.`, { errors });
      }
      if (errors.length > 0) {
        return res.status(207).json({ 
            success: true, 
            message: `CSV processed. ${createdCount} students created. ${errors.length} rows had errors.`,
            createdCount,
            errors
        });
      }
      res.json({ success: true, message: `All ${createdCount} students from CSV uploaded successfully.`, createdCount });
    })
    .on('error', (error) => {
        console.error("CSV Stream Error:", error);
        sendErrorResponse(res, 500, 'Error processing CSV file stream.');
    });
});

// GET /api/events/enrollment-summary/by-department - Get enrollment counts per department for display
// ... (This route remains the same)
router.get('/enrollment-summary/by-department', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  try {
    const summary = await Event.aggregate([
      { $match: { "courses.0": { "$exists": true } } }, 
      { $unwind: "$courses" },
      { $match: { "courses.slots.0": { "$exists": true } } }, 
      { $unwind: "$courses.slots" },
      { $match: { "courses.slots.enrolled.0": { "$exists": true } } }, 
      { $unwind: "$courses.slots.enrolled" },
      {
        $lookup: {
          from: "users", // IMPORTANT: This must be the exact name of your users collection in MongoDB
          localField: "courses.slots.enrolled",
          foreignField: "_id",
          as: "enrolledStudentInfo"
        }
      },
      { $unwind: "$enrolledStudentInfo" },
      {
        $group: {
          _id: {
            department: { $ifNull: ["$enrolledStudentInfo.department", "N/A"] }
          },
          enrollmentCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          department: "$_id.department",
          totalEnrollments: "$enrollmentCount",
        }
      },
      { $sort: { department: 1 } }
    ]);

    const distinctDepartmentsFromUsers = await User.distinct("department", { department: { $ne: null, $ne: "" } });
    
    const departmentsWithEnrollments = new Set(summary.map(s => s.department));
    
    let finalDistinctDepartments = [...new Set([...distinctDepartmentsFromUsers, ...departmentsWithEnrollments])];
    finalDistinctDepartments = finalDistinctDepartments.filter(dept => dept !== null && dept !== undefined);


    res.json({ success: true, data: { summary, distinctDepartments: finalDistinctDepartments.sort() } });
  } catch (err) {
    console.error('Error fetching enrollment summary by department:', err.stack);
    sendErrorResponse(res, 500, 'Failed to fetch department enrollment summary.');
  }
});

// POST /api/events/download/custom-detailed - Custom columns and department/event/course scope
router.post('/download/custom-detailed', authMiddleware, authorizeRoles('admin'), async (req, res) => {
    try {
        const { scope, columns } = req.body; // scope = { type: 'department'/'event'/'course', value: '...', eventId: '...', courseId: '...' }

        if (!scope || !scope.type || !Array.isArray(columns) || columns.length === 0) {
            return sendErrorResponse(res, 400, 'Report scope and selected columns are required.');
        }
        
        const columnDefinitions = {
            eventName: { header: 'Event Name', getValue: (event, course, slot, student) => event.name || 'N/A' },
            eventIsOpen: { header: 'Event Open', getValue: (event, course, slot, student) => event.isOpen ? 'Yes' : 'No' },
            courseTitle: { header: 'Course Title', getValue: (event, course, slot, student) => course.title || 'N/A' },
            courseDescription: { header: 'Course Description', getValue: (event, course, slot, student) => course.description || '' },
            slotTime: { header: 'Slot Time', getValue: (event, course, slot, student) => slot.time ? new Date(slot.time).toLocaleString() : 'N/A' },
            slotMaxCapacity: { header: 'Slot Max Capacity', getValue: (event, course, slot, student) => slot.maxCapacity },
            slotIsActive: { header: 'Slot Is Active', getValue: (event, course, slot, student) => slot.isActive ? 'Yes' : 'No' },
            studentName: { header: 'Student Name', getValue: (event, course, slot, student) => student ? (student.name || 'N/A') : '' },
            studentUsername: { header: 'Student Username', getValue: (event, course, slot, student) => student ? (student.username || 'N/A') : '' },
            studentDepartment: { header: 'Student Department', getValue: (event, course, slot, student) => student ? (student.department ? student.department.trim() : 'N/A') : '' },
        };

        const activeColumnDefinitions = columns
            .map(key => ({ key, ...columnDefinitions[key] }))
            .filter(def => def.header); 

        if (activeColumnDefinitions.length === 0) {
            return sendErrorResponse(res, 400, 'No valid columns selected for the report.');
        }

        let mongoQuery = {};
        if (scope.type === 'event' || scope.type === 'course') {
            if (!mongoose.Types.ObjectId.isValid(scope.value) && !mongoose.Types.ObjectId.isValid(scope.eventId)) {
                 return sendErrorResponse(res, 400, 'Invalid Event ID for scope.');
            }
            mongoQuery._id = scope.type === 'event' ? scope.value : scope.eventId;
        }
         if (scope.type === 'course' && !mongoose.Types.ObjectId.isValid(scope.courseId)) {
            return sendErrorResponse(res, 400, 'Invalid Course ID for scope.');
        }


        const events = await Event.find(mongoQuery) // Filter by event if scope is event or course
                               .populate({
                                  path: 'courses.slots.enrolled',
                                  model: 'User',
                                  select: 'username name department email', 
                               })
                               .lean();

        let reportDataRows = [];
        let scopeDescriptionForFilename = scope.type;

        events.forEach(event => {
            (event.courses || []).forEach(course => {
                // If scope is 'course', only process this course
                if (scope.type === 'course' && course._id.toString() !== scope.courseId) {
                    return; 
                }
                 scopeDescriptionForFilename = `${event.name.substring(0,15)}_${course.title.substring(0,15)}`;


                (course.slots || []).forEach(slot => {
                    const hasEnrollments = Array.isArray(slot.enrolled) && slot.enrolled.length > 0;

                    if (hasEnrollments) {
                        slot.enrolled.forEach(student => {
                            if (!student) return;

                            let matchesScope = false;
                            if (scope.type === 'department') {
                                const studentDept = student.department ? student.department.trim() : 'N/A';
                                matchesScope = scope.value === 'all' || studentDept === scope.value || (scope.value === 'N/A' && studentDept === 'N/A');
                                scopeDescriptionForFilename = scope.value === 'all' ? 'all_departments' : scope.value;
                            } else { // event or course scope, already filtered by event, course
                                matchesScope = true; 
                            }

                            if (matchesScope) {
                                const row = {};
                                activeColumnDefinitions.forEach(def => {
                                    row[def.key] = def.getValue(event, course, slot, student);
                                });
                                reportDataRows.push(row);
                            }
                        });
                    } else { // No enrollments in this slot
                        let addEmptySlotRow = false;
                        if (scope.type === 'department' && scope.value === 'all') { // Show empty slots for overall department report
                            addEmptySlotRow = true;
                        } else if (scope.type === 'event') { // Show empty slots if scoped to event
                            addEmptySlotRow = true;
                        } else if (scope.type === 'course' && course._id.toString() === scope.courseId) { // Show empty slots if scoped to this course
                             addEmptySlotRow = true;
                        }
                        
                        if (addEmptySlotRow && activeColumnDefinitions.some(def => !def.key.startsWith('student'))) {
                             const row = {};
                             activeColumnDefinitions.forEach(def => {
                                 row[def.key] = def.getValue(event, course, slot, null); // Pass null for student
                             });
                             reportDataRows.push(row);
                        }
                    }
                });
            });
        });
        
        const safeScopeDesc = scopeDescriptionForFilename.replace(/\s+/g, '_').replace(/[^\w-]/g, '');
        if (reportDataRows.length === 0) {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="custom_report_${safeScopeDesc}_empty.csv"`);
            const headerRowString = activeColumnDefinitions.map(def => def.header).map(escapeCsvField).join(',');
            return res.status(200).send(`${headerRowString}\r\nNo data found for the selected criteria.`);
        }
        
        // Sorting logic can be enhanced
        reportDataRows.sort((a, b) => {
            if (scope.type === 'department' && scope.value === 'all' && columns.includes('studentDepartment')) {
                const deptA = a.studentDepartment || 'zzz';
                const deptB = b.studentDepartment || 'zzz';
                if (deptA.localeCompare(deptB) !== 0) return deptA.localeCompare(deptB);
            }
            // Fallback or primary sort by eventName then courseTitle then studentName if columns exist
            if (columns.includes('eventName') && (a.eventName || '').localeCompare(b.eventName || '') !== 0) return (a.eventName || '').localeCompare(b.eventName || '');
            if (columns.includes('courseTitle') && (a.courseTitle || '').localeCompare(b.courseTitle || '') !== 0) return (a.courseTitle || '').localeCompare(b.courseTitle || '');
            if (columns.includes('studentName')) return (a.studentName || '').localeCompare(b.studentName || '');
            return 0; 
        });

        let csvRows = [];
        csvRows.push(activeColumnDefinitions.map(def => def.header).map(escapeCsvField).join(','));

        reportDataRows.forEach(dataRowObject => {
            const orderedRowValues = activeColumnDefinitions.map(def => dataRowObject[def.key] === undefined ? '' : dataRowObject[def.key]);
            csvRows.push(orderedRowValues.map(escapeCsvField).join(','));
        });

        const csvString = csvRows.join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="custom_report_${safeScopeDesc}.csv"`);
        res.status(200).send(csvString);

    } catch (err) {
        console.error(`Error generating custom detailed CSV:`, err.stack);
        sendErrorResponse(res, 500, `Failed to generate custom detailed CSV report.`, err.message);
    }
});
router.get('/:eventId/enrollment-status-by-department', authMiddleware, authorizeRoles('admin'), async (req, res) => {
    try {
        const { eventId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            return sendErrorResponse(res, 400, 'Invalid Event ID.');
        }

        const event = await Event.findById(eventId).lean();
        if (!event) {
            return sendErrorResponse(res, 404, 'Event not found.');
        }

        // 1. Get all students, grouped by department
        const allStudentsByDept = await User.aggregate([
            { $match: { role: 'student' } },
            {
                $group: {
                    _id: { $ifNull: ["$department", "N/A"] }, // Group by department, 'N/A' for null/empty
                    students: { $push: { _id: "$_id", name: "$name", username: "$username" } },
                    totalStudentsInDept: { $sum: 1 }
                }
            },
            { $project: { department: "$_id", students: 1, totalStudentsInDept: 1, _id: 0 } },
            { $sort: { department: 1 } }
        ]);

        if (allStudentsByDept.length === 0) {
            return res.json({
                success: true,
                data: {
                    eventName: event.name,
                    eventId: event._id,
                    departmentalStatus: [],
                    message: "No students found in the system."
                }
            });
        }

        // 2. Get IDs of students enrolled in THIS specific event
        const enrolledStudentIdsInThisEvent = new Set();
        (event.courses || []).forEach(course => {
            (course.slots || []).forEach(slot => {
                (slot.enrolled || []).forEach(studentIdObj => {
                    enrolledStudentIdsInThisEvent.add(studentIdObj.toString());
                });
            });
        });

        // 3. Calculate stats for each department
        const departmentalStatus = allStudentsByDept.map(deptGroup => {
            let enrolledInEventCount = 0;
            (deptGroup.students || []).forEach(student => {
                if (enrolledStudentIdsInThisEvent.has(student._id.toString())) {
                    enrolledInEventCount++;
                }
            });

            const notEnrolledCount = deptGroup.totalStudentsInDept - enrolledInEventCount;
            const percentageEnrolled = deptGroup.totalStudentsInDept > 0 ?
                parseFloat(((enrolledInEventCount / deptGroup.totalStudentsInDept) * 100).toFixed(2)) : 0;

            return {
                department: deptGroup.department,
                total_students: deptGroup.totalStudentsInDept,
                signed_in_students: enrolledInEventCount, // Renamed to match image
                not_signed_in_students: notEnrolledCount, // Renamed
                percentage_signed_in: percentageEnrolled  // Renamed
            };
        });

        res.json({
            success: true,
            data: {
                eventName: event.name,
                eventId: event._id,
                departmentalStatus: departmentalStatus // This is the array of department stats
            }
        });

    } catch (err) {
        console.error(`Error fetching departmental enrollment status for event ${req.params.eventId}:`, err.stack);
        sendErrorResponse(res, 500, 'Failed to fetch event enrollment status by department.');
    }
});


module.exports = router;