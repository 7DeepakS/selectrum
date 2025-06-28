// backend/server.js
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
// const mongoSanitize = require('express-mongo-sanitize'); // Keep commented for now or use mongoose-sanitize

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const studentRoutes = require('./routes/students');
const userRoutes = require('./routes/userRoutes'); // <--- IMPORT NEW ROUTES
// const { authMiddleware, authorizeRoles } = require('./middleware/authMiddleware'); // Not directly used here

const multer = require('multer');

const app = express();
const port = process.env.PORT || 5000;
const nodeEnv = process.env.NODE_ENV || 'development';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log(`MongoDB Atlas connected successfully in ${nodeEnv} mode.`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.error('Make sure your MONGODB_URI in .env is correct and your IP is whitelisted in Atlas.');
    process.exit(1);
  }
};
connectDB();

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://192.168.1.6:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || nodeEnv === 'development') {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS policy.'));
    }
  },
  credentials: true,
}));

app.use(helmet());
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));
// app.use(mongoSanitize()); // Keep commented or replace with mongoose-sanitize at schema level
app.use(hpp());

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are allowed.'), false);
    }
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/events', upload.single('csv'), eventRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/users', userRoutes); // <--- MOUNT NEW ROUTES

app.get('/', (req, res) => {
  res.json({ message: `Welcome to the Selectrum API! Environment: ${nodeEnv}` });
});

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err);
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err.name === 'CastError') { statusCode = 400; message = `Invalid ${err.path}: ${err.value}`; }
  if (err.name === 'ValidationError') { statusCode = 400; message = Object.values(err.errors).map(val => val.message).join(', '); }
  if (err.code === 11000) { statusCode = 400; const field = Object.keys(err.keyValue)[0]; message = `Duplicate field value entered for "${field}". Please use another value.`; }
  if (err.name === 'JsonWebTokenError') { statusCode = 401; message = 'Invalid token. Please log in again.'; }
  if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Your session has expired. Please log in again.'; }
  if (err.message === 'Not allowed by CORS policy.') { statusCode = 403; }
  if (err instanceof multer.MulterError) { statusCode = 400; if (err.code === 'LIMIT_FILE_SIZE') message = 'File is too large. Maximum size is 5MB.'; else message = err.message; }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(nodeEnv === 'development' && { stack: err.stack })
  });
});

app.use((req, res, next) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.originalUrl}` });
});

const server = app.listen(port, () => {
  console.log(`Server running in ${nodeEnv} mode on port ${port}`);
});

process.on('unhandledRejection', (err, promise) => {
  console.error(`Unhandled Rejection: ${err.message}`, err);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
    console.error(`Uncaught Exception: ${err.message}`, err);
    server.close(() => process.exit(1));
});