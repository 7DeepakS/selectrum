require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');

// --- Route Imports ---
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const studentRoutes = require('./routes/students');
const userRoutes = require('./routes/userRoutes');

// --- Initializations ---
const app = express();
const port = process.env.PORT || 5000;
const nodeEnv = process.env.NODE_ENV || 'development';

// --- Database Connection ---
const connectDB = async () => {
  try {
    // Mongoose 6+ has good defaults, so explicit options are often not needed.
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`🚀 MongoDB Atlas connected successfully in ${nodeEnv} mode.`);
  } catch (err) {
    console.error('🔴 MongoDB connection error:', err.message);
    process.exit(1); // Exit process with failure
  }
};
connectDB();

// --- Core Middleware ---

// CORS Configuration: Controls which frontends can access this API
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://192.168.1.6:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || nodeEnv === 'development') {
      callback(null, true);
    } else {
      callback(new Error('This origin is not allowed by the CORS policy.'));
    }
  },
  credentials: true,
}));

// Security Middleware
app.use(helmet());
app.use(hpp());

// Body Parsers
app.use(express.json({ limit: '10kb' }));
// Removed urlencoded as it's less common for JSON-based APIs

// --- API Routes ---
// Note: Multer is no longer applied globally to the /api/events route here.
// It will be applied specifically to the upload route within events.js
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes); // <-- CORRECTED: multer removed from here
app.use('/api/students', studentRoutes);
app.use('/api/users', userRoutes);

// Health check route
app.get('/', (req, res) => {
  res.json({ message: "Welcome to the Selectrum API! We are live." });
});


// --- Error Handling Middleware ---
// 404 Not Found Handler (catches unhandled requests)
app.use((req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error); // Pass error to the global error handler
});

// Global Error Handler (catches all errors)
const multer = require('multer'); // Keep multer here for `instanceof multer.MulterError` check
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.name, err.message);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Customize messages for common errors
  if (err.name === 'CastError') { statusCode = 400; message = `Invalid format for resource ID: ${err.value}`; }
  if (err.name === 'ValidationError') { statusCode = 400; message = Object.values(err.errors).map(val => val.message).join('. '); }
  if (err.code === 11000) { statusCode = 400; const field = Object.keys(err.keyValue)[0]; message = `The value for "${field}" must be unique.`; }
  if (err.name === 'JsonWebTokenError') { statusCode = 401; message = 'Authentication token is invalid.'; }
  if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Your session has expired.'; }
  if (err instanceof multer.MulterError) { 
      statusCode = 400; 
      if (err.code === 'LIMIT_FILE_SIZE') message = 'File is too large. Max size is 5MB.';
      else message = err.message; 
  }

  res.status(statusCode).json({
    success: false,
    error: message,
  });
});

// --- Server Start & Process Management ---
const server = app.listen(port, () => {
  console.log(`✅ Server running in ${nodeEnv} mode on port ${port}`);
  if (!process.env.MONGODB_URI) console.warn('⚠️ WARNING: MONGODB_URI is not set!');
  if (nodeEnv === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
      console.warn('⚠️ SECURITY WARNING: JWT_SECRET is weak or not set in production!');
  }
});

const shutdown = (signal) => {
    console.info(`\n${signal} received. Closing HTTP server.`);
    server.close(() => {
        console.log('HTTP server closed.');
        mongoose.connection.close(false).then(() => {
            console.log('MongoDB connection closed.');
            process.exit(0);
        });
    });
};

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('UNHANDLED_REJECTION');
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));