// models/Event.js
const mongoose = require('mongoose');

// Slot sub-schema
const slotSchema = new mongoose.Schema({
  id: { type: Number, required: true }, // Maintained for consistency with original, consider using _id
  time: { type: Date, required: true },
  maxCapacity: { type: Number, required: true, min: 1 },
  enrolled: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true },
}, { _id: true }); // Ensure subdocuments get an _id

// Course sub-schema
const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 1000 },
  slots: [slotSchema],
});

// Main Event schema
const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true, // This creates the index for event name
    maxlength: 150
  },
  isOpen: { type: Boolean, default: false },
  courses: [courseSchema],
}, {
  timestamps: true,
});

// You can keep this if you specifically want an index on course titles
// for faster searching/sorting by course titles within events.
eventSchema.index({ "courses.title": 1 });

module.exports = mongoose.model('Event', eventSchema);