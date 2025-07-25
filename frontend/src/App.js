// src/App.js
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Outlet, Navigate, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// --- Lazy Loaded Pages ---
const Login = lazy(() => import('./components/Login'));
const ChangePasswordPage = lazy(() => import('./components/ChangePasswordPage'));
const StudentView = lazy(() => import('./components/StudentView')); // Your main student component
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const StudentManagementPage = lazy(() => import('./pages/StudentManagementPage'));
const EventManagementPage = lazy(() => import('./pages/EventManagementPage'));
const CourseManagementPage = lazy(() => import('./pages/CourseManagementPage'));

// --- Helper & Layout Components ---
const LoadingSpinner = () => <div className="flex justify-center items-center h-screen text-xl font-semibold text-indigo-600">Loading...</div>;
const NotFoundPage = () => <div className="p-8 text-center"><h1>404 - Page Not Found</h1></div>;
const UnauthorizedPage = () => <div className="p-8 text-center text-red-500"><h1>403 - Unauthorized</h1><p>You do not have permission to access this page.</p></div>;

// --- Student-specific Layout ---
const StudentLayout = () => {
    const { user, logout } = useAuth();
    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-indigo-700 text-white p-4 shadow-lg sticky top-0 z-10">
                <div className="container mx-auto flex justify-between items-center">
                    <div className="font-bold text-xl">
                        Selectrum Portal
                    </div>
                    <div className="flex items-center">
                        <span className="mr-4 text-indigo-100 hidden sm:inline">Welcome, {user?.name}!</span>
                        <button 
                          onClick={logout} 
                          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md shadow hover:shadow-md transition"
                        >
                          Logout
                        </button>
                    </div>
                </div>
            </header>
            <main className="container mx-auto p-4 md:p-6">
                <Outlet /> {/* Renders the StudentView component */}
            </main>
        </div>
    );
};

// --- Admin-specific Layout ---
const AdminLayout = () => {
  const { logout } = useAuth();
  const navLinkClass = ({ isActive }) => `block p-2 rounded-md transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'hover:bg-gray-700'}`;
  return (
    <div className="flex min-h-screen bg-gray-100">
      <nav className="w-64 bg-gray-800 text-white p-5 flex-shrink-0 flex flex-col">
        <div>
          <h2 className="font-bold text-2xl mb-10 text-center">Selectrum Admin</h2>
          <ul className="space-y-3">
            <li><NavLink to="/admin" end className={navLinkClass}>Dashboard</NavLink></li>
            <li><NavLink to="/admin/students" className={navLinkClass}>Manage Students</NavLink></li>
            <li><NavLink to="/admin/events" className={navLinkClass}>Manage Events</NavLink></li>
          </ul>
        </div>
        <div className="mt-auto"><button onClick={logout} className="w-full p-2 rounded bg-red-600 hover:bg-red-700">Logout</button></div>
      </nav>
      <main className="flex-1 p-8 overflow-y-auto"><Outlet /></main>
    </div>
  );
};


// --- Route Protection and Logic Components ---
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user && user.requiresPasswordChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" state={{ from: location }} replace />;
  }
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/unauthorized" replace />;
  return children;
};

const LoginWrapper = () => {
  const { isAuthenticated, user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (isAuthenticated && user) {
    if (user.requiresPasswordChange) return <Navigate to="/change-password" replace />;
    return <Navigate to={user.role === 'admin' ? '/admin' : '/student-dashboard'} replace />;
  }
  return <Login />;
};

// --- Main App Component ---
function App() {
  return (
    <Router>
      <AuthProvider>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Public / Entry Routes */}
            <Route path="/login" element={<LoginWrapper />} />
            <Route path="/" element={<LoginWrapper />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            
            {/* Authenticated Routes */}
            <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
            
            {/* Student Route using the new StudentLayout */}
            <Route path="/student-dashboard" element={<ProtectedRoute><StudentLayout /></ProtectedRoute>}>
              <Route index element={<StudentView />} />
            </Route>

            {/* Admin Section with its own AdminLayout */}
            <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminLayout /></ProtectedRoute>}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="students" element={<StudentManagementPage />} />
              <Route path="events" element={<EventManagementPage />} />
              <Route path="events/:eventId" element={<CourseManagementPage />} />
            </Route>
            
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
  );
}

export default App;