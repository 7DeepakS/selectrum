const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  time: { type: Date, required: true },
  maxCapacity: { type: Number, required: true, min: 1 },
  enrolled: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true },
}, { _id: true });

const courseOfferingSchema = new mongoose.Schema({
  course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true
  },
  slots: [slotSchema],
});

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  isOpen: { type: Boolean, default: false },
  maxCoursesPerStudent: { type: Number, default: 1, min: 1 },
  courses: [courseOfferingSchema],
  
  // --- UPDATED & NEW FIELDS ---
  allowedDepartments: {
    type: [String],
    default: [], // An empty array means ALL departments are allowed
  },
  allowedSemesters: {
    type: [String],
    default: [], // An empty array means ALL semesters are allowed
  },
  allowedSections: {
    type: [String],
    default: [], // An empty array means ALL sections are allowed
  },
  isViewOnly: {
    type: Boolean,
    default: false, // If true, enrollment is disabled even if the event is open
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Event', eventSchema);