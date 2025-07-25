// src/components/Login.js
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom'; // Import Link for any extra navigation

function Login() {
  // Get the login function and any auth-related state from our custom hook
  const { login, isLoading, authError, setAuthError } = useAuth();
  
  const [credentials, setCredentials] = useState({ username: '', password: '' });

  const handleChange = (e) => {
    // When the user starts typing, it's good UX to clear any previous login error
    if (authError) {
      setAuthError(null);
    }
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!credentials.username || !credentials.password) {
      // Set the error in the context so it's displayed in our UI
      setAuthError("Please enter both username and password.");
      return;
    }
    
    // ======================= THE FIX IS HERE =======================
    try {
      // We wrap the `login` call, which is an async operation that can fail (reject).
      await login(credentials);
      // If the line above doesn't throw an error, the login was successful.
      // The LoginWrapper in App.js will handle redirecting the user.
      
    } catch (error) {
      // If `login` throws an error, this `catch` block will execute.
      // The `AuthContext` already sets the `authError` state for us.
      // This block's purpose is to prevent the "Uncaught promise" crash.
      console.log("Login component caught an error, but it was handled gracefully.");
    }
    // ===================== END OF THE FIX ======================
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-4">
      <form
        onSubmit={handleSubmit}
        className="p-8 bg-white rounded-lg shadow-xl w-full max-w-sm"
      >
        <h2 className="text-3xl font-bold mb-6 text-center text-indigo-700">SELECTRUM</h2>

        {/* This will display the error message set in the AuthContext */}
        {authError && (
          <p className="text-red-600 text-center mb-4 p-2 bg-red-100 border border-red-300 rounded">
            {authError}
          </p>
        )}

        <div className="space-y-5">
          <div>
            <label htmlFor="username" className="sr-only">Username</label>
            <input
              type="text"
              id="username"
              name="username" // Use name attribute for easy handling in `handleChange`
              value={credentials.username}
              onChange={handleChange}
              placeholder="Username"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="sr-only">Password</label>
            <input
              type="password"
              id="password"
              name="password" // Use name attribute
              value={credentials.password}
              onChange={handleChange}
              placeholder="Password"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className={`w-full p-3 rounded-lg text-white font-semibold transition duration-200 ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed animate-pulse'
                : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-300'
            }`}
            disabled={isLoading}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Login;