// src/components/ProtectedRoute.js
import React, { useContext } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthContext } from './AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
  const { isAuthenticated, user, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) {
    // You can return a loading spinner here
    return <div className="flex justify-center items-center min-h-screen">Loading authentication state...</div>;
  }

  if (!isAuthenticated) {
    // Redirect to login, preserving the intended location
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // User is authenticated but does not have the required role
    // Redirect to a "not authorized" page or back to a default page
    // For simplicity, redirecting to a student page or admin based on role
    // Or show an "Access Denied" component
    console.warn(`User role ${user?.role} not in allowed roles: ${allowedRoles}`);
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/student'} replace />;
    // Or: return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />; // Render the child route component
};

export default ProtectedRoute;