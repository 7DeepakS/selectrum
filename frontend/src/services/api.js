// src/services/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000, // Increased timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add JWT token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor to handle responses (e.g., for global error handling or token expiry)
api.interceptors.response.use(
  (response) => response, // Simply return the response if successful
  (error) => {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('API Error Response:', error.response.data);
      if (error.response.status === 401) {
        // Handle unauthorized errors (e.g., token expired)
        // localStorage.removeItem('token');
        // localStorage.removeItem('user'); // Or however you store user info
        // Potentially redirect to login: window.location.href = '/';
        // For a more robust solution, use a state management (Context/Redux) to trigger logout
        // This is a good place to emit an event or update a global state for logout
        console.warn('Unauthorized access or token expired. Consider logging out user.');
      }
      // Return a more structured error
      return Promise.reject(error.response.data || { error: 'An unexpected error occurred' });
    } else if (error.request) {
      // The request was made but no response was received
      console.error('API No Response:', error.request);
      return Promise.reject({ error: 'Network error or server did not respond.' });
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('API Request Setup Error:', error.message);
      return Promise.reject({ error: error.message });
    }
  }
);

export default api;

// Example usage:
// api.get('/events')
// api.post('/auth/login', credentials)