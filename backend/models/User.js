// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true, // This creates the index for username
    trim: true,
    lowercase: true,
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
  selectedEvent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    default: null,
  },
  requiresPasswordChange: { // <--- NEW FIELD
    type: Boolean,
    default: true, // Default to true for all newly registered users
  }
}, {
  timestamps: true,
});

userSchema.index({ role: 1 });

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

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);