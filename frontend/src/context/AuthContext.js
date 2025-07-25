// src/context/AuthContext.js
import React, { createContext, useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

// Create the context object
export const AuthContext = createContext(null);

// Create a custom hook for easy consumption in other components. This is the missing export.
export const useAuth = () => {
  return useContext(AuthContext);
};

// The main provider component that wraps your app
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true); // Start true to validate token on initial load
  
  // This will be used by the Login page to show errors. We won't use a timed one here.
  const [authError, setAuthError] = useState(null); 
  
  const navigate = useNavigate();
  const location = useLocation();

  // This effect runs only once on app startup to check for a stored session
  useEffect(() => {
    const checkStoredSession = () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
        } catch (e) {
          console.error("Corrupt user data in storage. Clearing session.", e);
          // Clean up if data is bad
          localStorage.clear();
          setToken(null);
          setUser(null);
          delete api.defaults.headers.common['Authorization'];
        }
      }
      setIsLoading(false); // Finished checking, app can now render routes
    };

    checkStoredSession();
  }, []); // Empty dependency array ensures this runs only once

  const login = useCallback(async (credentials) => {
    setIsLoading(true);
    setAuthError(null); // Clear previous errors on a new attempt
    try {
      const response = await api.post('auth/login', credentials);
      
      const { token: apiToken, user: apiUser } = response.data;
      
      localStorage.setItem('token', apiToken);
      localStorage.setItem('user', JSON.stringify(apiUser));
      api.defaults.headers.common['Authorization'] = `Bearer ${apiToken}`;
      setToken(apiToken);
      setUser(apiUser);
      
      // Smart redirection after login
      const from = location.state?.from?.pathname || (apiUser.role === 'admin' ? '/admin' : '/student-dashboard');
      
      if (apiUser.requiresPasswordChange) {
        navigate('/change-password');
      } else {
        navigate(from, { replace: true });
      }
      
    } catch (err) {
      const errorMessage = err.error || 'Login failed. Please check your credentials.';
      setAuthError(errorMessage); // Set the error for the login page to display
      console.error("Login failed in AuthContext:", err);
      throw err; // Re-throw the error so the calling component knows it failed
    } finally {
      setIsLoading(false);
    }
  }, [navigate, location.state]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
    navigate('/login'); // Navigate to the login page after logout
  }, [navigate]);

  // A single function to update the user in both state and localStorage
  const updateUser = useCallback((updatedUserData) => {
    setUser(currentUser => {
      const newFullUser = { ...currentUser, ...updatedUserData };
      localStorage.setItem('user', JSON.stringify(newFullUser));
      return newFullUser;
    });
  }, []);

  // useMemo ensures this object is stable and prevents unnecessary re-renders
  const value = useMemo(() => ({
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    authError,
    setAuthError, // Expose this so components can clear the error
    login,
    logout,
    updateUser,
  }), [user, token, isLoading, authError, login, logout, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};