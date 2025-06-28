// src/context/AuthContext.js
import React, { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken) {
      setToken(storedToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          // If user reloads on change password page, ensure flag is respected
          if (parsedUser.requiresPasswordChange && window.location.pathname !== '/change-password') {
            navigate('/change-password', { replace: true });
          }
        } catch (e) {
          console.error("Failed to parse stored user", e);
          localStorage.removeItem('user');
          localStorage.removeItem('token'); // Also remove token if user data is corrupt
        }
      } else {
        // Token exists but no user data, could be an old session or partial logout
        localStorage.removeItem('token');
        setToken(null);
      }
    }
    setLoading(false);
  }, [navigate]); // Added navigate to dependency array

  const login = useCallback(async (credentials) => {
    setLoading(true);
    setAuthError(null);
    const loginUrl = '/auth/login';
    console.log(
      'FRONTEND: Attempting API login to:',
      api.defaults.baseURL ? api.defaults.baseURL + loginUrl : `[baseURL not set] ${loginUrl}`,
      'with credentials:',
      credentials
    );

    try {
      const response = await api.post(loginUrl, credentials);
      if (response.data.success) {
        const { token: apiToken, user: apiUser } = response.data;
        localStorage.setItem('token', apiToken);
        localStorage.setItem('user', JSON.stringify(apiUser));
        setToken(apiToken);
        setUser(apiUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${apiToken}`;

        if (apiUser.requiresPasswordChange) { // <--- CHECK THE FLAG
          console.log('FRONTEND: User requires password change. Navigating to /change-password');
          navigate('/change-password');
        } else {
          console.log('FRONTEND: Login successful. Navigating to dashboard.');
          navigate(apiUser.role === 'admin' ? '/admin' : '/student');
        }
        return true;
      } else {
        setAuthError(response.data.error || 'Login failed.');
        return false;
      }
    } catch (err) {
      console.error("FRONTEND: Login API call failed. Error object:", err);
      if (err.isAxiosError && err.response) {
        console.error("FRONTEND: Server responded with error:", err.response.data);
        setAuthError(err.response.data.error || `Server error: ${err.response.status}`);
      } else if (err.isAxiosError && err.request) {
        console.error("FRONTEND: No response received from server. Request object:", err.request);
        setAuthError('No response from server. Check network or if backend is running.');
      } else {
        console.error("FRONTEND: Error setting up login request or other error:", err.message);
        setAuthError(err.message || 'Login failed due to a client-side or network error.');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const logout = useCallback(() => {
    console.log('FRONTEND: Logging out user.');
    setLoading(true);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    delete api.defaults.headers.common['Authorization'];
    setLoading(false);
    navigate('/');
  }, [navigate]);

  // Function to update user in context, e.g., after password change
  const updateUserContext = useCallback((updatedUserData) => {
    console.log('FRONTEND: Updating user context with:', updatedUserData);
    // Ensure that the current user state is spread correctly if it exists
    const newFullUser = user ? { ...user, ...updatedUserData } : updatedUserData;
    setUser(newFullUser);
    localStorage.setItem('user', JSON.stringify(newFullUser));
  }, [user]); // Add user to dependency array

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    loading,
    authError,
    login,
    logout,
    setUser, // Keep for direct manipulation if ever needed by other components
    updateUserContext, // <--- Expose function to update user
    setAuthError
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};