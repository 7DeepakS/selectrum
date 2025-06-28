// src/components/Login.js
import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

function Login() {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const { login, loading, authError, setAuthError } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // ---- ADD THIS CONSOLE.LOG ----
    console.log('LOGIN COMPONENT: handleSubmit called. Credentials:', credentials); 
    // -----------------------------
    setAuthError(null); // Clear previous errors
    await login(credentials);
  };

  const handleChange = (e) => {
    setCredentials({ ...credentials, [e.target.id]: e.target.value });
  };

  return (
    // ... your JSX form ...
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
      <form
        onSubmit={handleSubmit} // Make sure onSubmit is correctly assigned
        className="p-8 bg-white rounded-lg shadow-xl w-full max-w-sm transform transition-all duration-300 hover:scale-105"
      >
        <h2 className="text-3xl font-bold mb-6 text-center text-indigo-700">SELECTRUM</h2>

        {authError && <p className="text-red-600 text-center mb-4 p-2 bg-red-100 border border-red-400 rounded">{authError}</p>}

        <div className="space-y-5">
          <div className="relative">
            <input
              type="text"
              id="username" // Ensure id matches state key
              value={credentials.username}
              onChange={handleChange}
              placeholder="Username"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
              required
              autoComplete="username"
            />
          </div>

          <div className="relative">
            <input
              type="password"
              id="password" // Ensure id matches state key
              value={credentials.password}
              onChange={handleChange}
              placeholder="Password"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit" // Make sure this is type="submit"
            className={`w-full p-3 rounded-lg text-white font-semibold transition duration-200 ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-300'
            }`}
            disabled={loading}
          >
            {/* ... loading indicator ... */}
            {loading ? 'Processing...' : 'Login'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default React.memo(Login);