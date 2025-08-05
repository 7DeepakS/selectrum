const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Course title is required.'],
        trim: true,
        unique: true, // A course title like "Cisco 1" should only exist once in the catalog
        maxlength: 200,
    },
    description: {
        type: String,
        trim: true,
        maxlength: 1000,
    },
    // Prerequisites now correctly reference other documents in THIS SAME COLLECTION.
    prerequisites: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course' 
    }],

    // --- NEW FIELD ADDED HERE ---
    exclusiveGroup: {
        type: String,
        trim: true,
        // This is not required. If a course is not part of an exclusive group, this field will be empty.
    },

}, {
    timestamps: true
});

module.exports = mongoose.model('Course', courseSchema);