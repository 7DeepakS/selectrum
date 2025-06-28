// src/App.js
import React, { useContext, Suspense, lazy } from 'react'; // Added Suspense and lazy
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';

// Basic Loading Spinner Component (can be more elaborate)
const LoadingSpinner = () => (
  <div className="flex justify-center items-center min-h-screen text-xl font-semibold text-indigo-600">
    Loading Page...
  </div>
);

// Lazy load components for better initial load performance and easier debugging
const Login = lazy(() => import('./components/Login'));
const StudentView = lazy(() => import('./components/StudentView'));
const AdminView = lazy(() => import('./components/AdminView'));
const ChangePasswordPage = lazy(() => import('./components/ChangePasswordPage'));

// Main Layout Component (includes navigation for authenticated users)
const MainLayout = () => {
  const { user, logout, isAuthenticated } = useContext(AuthContext);

  if (!isAuthenticated && !user) { // Should ideally be handled by ProtectedRoute, but as a safeguard
      // This might happen briefly during logout or if state is inconsistent.
      // Depending on your ProtectedRoute logic, this might not be strictly necessary here.
      return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated && user && ( // Ensure user object exists before accessing its properties
        <nav className="bg-indigo-700 text-white p-4 shadow-lg">
          <div className="container mx-auto flex flex-wrap justify-between items-center">
            <span className="font-bold text-2xl tracking-tight">
              Selectrum Portal <span className="text-sm font-normal text-indigo-200">({user.role})</span>
            </span>
            <div className="flex items-center mt-2 sm:mt-0">
              <span className="mr-4 text-indigo-100">
                Welcome, {user.name || user.username}!
              </span>
              <button
                onClick={logout}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md shadow hover:shadow-md transition duration-150 ease-in-out"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>
      )}
      <main className="container mx-auto p-6"> {/* Added more padding */}
        <Suspense fallback={<LoadingSpinner />}>
          <Outlet /> {/* Renders the matched child route's element */}
        </Suspense>
      </main>
      <footer className="text-center p-4 text-sm text-gray-500 border-t mt-auto">
        © {new Date().getFullYear()} Selectrum. All rights reserved.
      </footer>
    </div>
  );
};

// Protected Route Component (Generic)
// Assumes AuthContext provides: isAuthenticated, loading, user
const ProtectedRoute = ({ allowedRoles }) => {
  const { isAuthenticated, user, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (user && user.requiresPasswordChange && location.pathname !== '/change-password') {
    // If password change is required and user is not on change-password page, redirect them.
    return <Navigate to="/change-password" state={{ from: location }} replace />;
  }
  
  if (user && !user.requiresPasswordChange && location.pathname === '/change-password') {
    // If password change is NOT required and user tries to access change-password, redirect to their dashboard.
     return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
  }


  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // User is authenticated but does not have the required role
    // You could redirect to a "Not Authorized" page or back to login/dashboard
    // For simplicity, redirecting to their default dashboard or login
    console.warn(`User role ${user.role} not in allowedRoles for ${location.pathname}. Redirecting.`);
    return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />; // Or to '/'
  }

  return <Outlet />; // Render child routes if all checks pass
};


// Login Page Wrapper (handles redirection logic)
const LoginWrapper = () => {
  const { isAuthenticated, user, loading } = useContext(AuthContext);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (isAuthenticated && user) {
    if (user.requiresPasswordChange) {
      return <Navigate to="/change-password" replace />;
    }
    // If authenticated and no password change needed, redirect to appropriate dashboard
    return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
  }

  // If not authenticated, show Login page
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Login />
    </Suspense>
  );
};

// Route specifically for the Change Password page
const ChangePasswordRoute = () => {
    const { isAuthenticated, user, loading } = useContext(AuthContext);

    if (loading) {
        return <LoadingSpinner />;
    }

    if (!isAuthenticated || !user) { // Must be authenticated to change password
        return <Navigate to="/" replace />;
    }
    
    // If password change is not required, but they are on this page, redirect them.
    // This could happen if they bookmark it or navigate directly.
    // The LoginWrapper also handles this, but good to have a check here too.
    if (user && !user.requiresPasswordChange) {
        return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
    }

    return (
        <Suspense fallback={<LoadingSpinner />}>
            <ChangePasswordPage />
        </Suspense>
    );
};


function App() {
  return (
    <Router>
      <AuthProvider> {/* AuthProvider should handle its own loading state internally */}
        <Routes>
          <Route path="/" element={<LoginWrapper />} />
          <Route path="/change-password" element={<ChangePasswordRoute />} />

          {/* Protected Routes within MainLayout */}
          <Route element={<MainLayout />}> {/* MainLayout now wraps protected content */}
            <Route element={<ProtectedRoute allowedRoles={['student']} />}>
              <Route path="student" element={<StudentView />} /> {/* No leading slash for nested routes */}
            </Route>
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="admin" element={<AdminView />} /> {/* No leading slash for nested routes */}
            </Route>
          </Route>
          
          {/* Fallback for any other unmatched routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;