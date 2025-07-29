const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    // --- FIX #1: Corrected the regular expression from "0--9" to "0-9" ---
    match: [/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, underscore, dot, or hyphen'],
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  role: {
    type: String,
    enum: ['admin', 'student'],
    required: [true, 'Role is required'],
    default: 'student',
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false, // Don't return password by default on queries
  },
  department: {
    type: String,
    trim: true,
    maxlength: [100, 'Department cannot exceed 100 characters'],
  },
  semester: {
    type: String,
    trim: true,
    maxlength: [50, 'Semester cannot exceed 50 characters'],
  },
  section: {
    type: String,
    trim: true,
    maxlength: [50, 'Section cannot exceed 50 characters'],
  },
  requiresPasswordChange: {
    type: Boolean,
    default: true,
  },
  enrollments: [{
        _id: false,
        eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
        courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true }, 
        courseTitle: { type: String, required: true },
        enrolledAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

// Create indexes for fields that are frequently queried
userSchema.index({ role: 1 });
userSchema.index({ department: 1 });
userSchema.index({ "enrollments.eventId": 1 });

// Hash password before saving the user document
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare entered password with hashed password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// --- FIX #2: Prevent the OverwriteModelError ---
// This checks if the model already exists before trying to create it.
module.exports = mongoose.models.User || mongoose.model('User', userSchema);