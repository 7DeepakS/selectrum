const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // This links to a document in the 'users' collection
        required: true,
        index: true,     // Index for faster searching by user
    },
    username: {          // Storing username directly avoids needing to populate just to see who it was.
        type: String,
        required: true,
    },
    action: {            // The specific action that was performed.
        type: String,
        required: true,
        enum: [
            'LOGIN_SUCCESS', 
            'ENROLL_SUCCESS', 
            'ENROLL_FAIL'
            // Future actions can be added here, e.g., 'PASSWORD_CHANGE', 'LOGOUT'
        ],
        index: true,     // Index for faster searching by action type
    },
    details: {           // An object to hold extra, context-specific information.
        ip: String,      // The IP address of the user who performed the action.
        
        // Fields for enrollment actions
        event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
        eventName: String,
        courseTitle: String,
        slotNumericId: Number,

        // Field for failed actions
        errorMessage: String, 
    },
}, {
    timestamps: true,    // This automatically adds `createdAt` and `updatedAt` fields.
});
module.exports = mongoose.model('ActivityLog', activityLogSchema);