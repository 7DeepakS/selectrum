import React, { Suspense, lazy, useState, Component } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Menu, X, LogOut, Home, Users, Calendar } from 'react-feather';

// --- Lazy Loaded Pages ---
const Login = lazy(() => import('./components/Login'));
const ChangePasswordPage = lazy(() => import('./components/ChangePasswordPage'));
const StudentView = lazy(() => import('./components/StudentView'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const StudentManagementPage = lazy(() => import('./pages/StudentManagementPage'));
const EventManagementPage = lazy(() => import('./pages/EventManagementPage'));
const CourseManagementPage = lazy(() => import('./pages/CourseManagementPage'));
const BulkEnrollmentPage = lazy(() => import('./pages/BulkEnrollmentPage'));
const CatalogManagementPage = lazy(() => import('./pages/CatalogManagementPage'));

// --- Error Boundary ---
class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-indigo-50">
          <div className="text-center p-8 bg-white rounded-xl shadow-md max-w-md w-full">
            <h1 className="text-2xl font-semibold text-indigo-700 mb-4 tracking-tight">Something Went Wrong</h1>
            <p className="text-gray-600 mb-6 text-sm">Please try refreshing the page or contact support.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-200 focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 font-medium text-sm"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Helper & Layout Components ---
const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-screen bg-indigo-50">
    <div className="flex items-center space-x-3 text-lg font-medium text-indigo-600">
      <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z"></path>
      </svg>
      <span>Loading...</span>
    </div>
  </div>
);

const NotFoundPage = () => (
  <div className="flex items-center justify-center min-h-screen bg-indigo-50">
    <div className="text-center p-8 bg-white rounded-xl shadow-md max-w-md w-full">
      <h1 className="text-3xl font-semibold text-indigo-700 mb-4 tracking-tight">404 - Page Not Found</h1>
      <p className="text-gray-600 mb-6 text-sm">The page you're looking for doesn't exist.</p>
      <NavLink
        to="/"
        className="inline-block px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-200 focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 font-medium text-sm"
      >
        Go Home
      </NavLink>
    </div>
  </div>
);

const UnauthorizedPage = () => (
  <div className="flex items-center justify-center min-h-screen bg-indigo-50">
    <div className="text-center p-8 bg-white rounded-xl shadow-md max-w-md w-full">
      <h1 className="text-3xl font-semibold text-red-600 mb-4 tracking-tight">403 - Unauthorized</h1>
      <p className="text-gray-600 mb-6 text-sm">You do not have permission to access this page.</p>
      <NavLink
        to="/"
        className="inline-block px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-200 focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 font-medium text-sm"
      >
        Go Home
      </NavLink>
    </div>
  </div>
);

// --- Student-specific Layout ---
const StudentLayout = () => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-indigo-50 font-sans">
      <header className="bg-indigo-700 text-white shadow-md sticky top-0 z-20">
        <div className="container mx-auto flex justify-between items-center px-4 py-3">
          <div className="flex items-center">
            <button
              className="lg:hidden mr-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <NavLink to="/student-dashboard" className="font-semibold text-lg tracking-tight">
              Selectrum Portal
            </NavLink>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-indigo-100 hidden sm:inline text-sm font-medium">
              Welcome, {user?.name || 'Student'}!
            </span>
            <button
              onClick={logout}
              className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition duration-200 focus:ring-2 focus:ring-red-400 focus:ring-offset-2 text-sm"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar for mobile */}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-indigo-800 text-white transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:hidden shadow-lg`}
      >
        <div className="flex justify-between items-center px-4 py-3 border-b border-indigo-700">
          <h2 className="font-semibold text-lg tracking-tight">Menu</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className="focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
            aria-label="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="p-4">
          <ul className="space-y-2">
            <li>
              <NavLink
                to="/student-dashboard"
                className={({ isActive }) =>
                  `flex items-center p-3 rounded-lg transition duration-200 text-sm font-medium ${
                    isActive ? 'bg-indigo-600 text-white' : 'text-indigo-100 hover:bg-indigo-700'
                  }`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Home className="w-5 h-5 mr-2" />
                Dashboard
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="container mx-auto px-4 py-6 md:px-6 md:py-8 max-w-6xl">
        <Outlet />
      </main>
    </div>
  );
};

// --- Admin-specific Layout ---
const AdminLayout = () => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navLinkClass = ({ isActive }) =>
    `flex items-center p-3 rounded-lg transition duration-200 text-sm font-medium ${
      isActive ? 'bg-indigo-600 text-white' : 'text-indigo-100 hover:bg-indigo-700'
    }`;

  return (
    <div className="flex min-h-screen bg-indigo-50 font-sans">
      {/* Sidebar */}
      <nav
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-indigo-800 text-white flex-shrink-0 flex flex-col transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:inset-0 shadow-lg`}
      >
        <div className="flex justify-between items-center px-4 py-3 border-b border-indigo-700">
          <h2 className="font-semibold text-lg tracking-tight">Selectrum Admin</h2>
          <button
            className="lg:hidden focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <NavLink to="/admin" end className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <Home className="w-5 h-5 mr-2" />
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/students" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <Users className="w-5 h-5 mr-2" />
                Manage Students
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/events" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <Calendar className="w-5 h-5 mr-2" />
                Manage Events
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/bulk-enroll" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <Calendar className="w-5 h-5 mr-2" />
                Bulk Enroll Students
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/catalog" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <Calendar className="w-5 h-5 mr-2" />
                Manage Course Catalog
              </NavLink>
            </li>
          </ul>
        </div>
        <div className="p-4 border-t border-indigo-700">
          <div className="text-sm text-indigo-200 mb-3 font-medium">Logged in as {user?.name || 'Admin'}</div>
          <button
            onClick={logout}
            className="flex items-center w-full p-3 text-red-300 rounded-lg hover:bg-red-600 hover:text-white transition duration-200 focus:ring-2 focus:ring-red-400 focus:ring-offset-2 text-sm font-medium"
            aria-label="Logout"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Logout
          </button>
        </div>
      </nav>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-indigo-700 text-white shadow-md px-4 py-3 flex items-center justify-between lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold tracking-tight">Selectrum Admin</h1>
        </header>
        <main className="flex-1 px-6 py-8 max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
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
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* Public / Entry Routes */}
              <Route path="/login" element={<LoginWrapper />} />
              <Route path="/" element={<LoginWrapper />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />

              {/* Authenticated Routes */}
              <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />

              {/* Student Route */}
              <Route path="/student-dashboard" element={<ProtectedRoute><StudentLayout /></ProtectedRoute>}>
                <Route index element={<StudentView />} />
              </Route>

              {/* Admin Section */}
              <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminLayout /></ProtectedRoute>}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="students" element={<StudentManagementPage />} />
                <Route path="events" element={<EventManagementPage />} />
                <Route path="events/:eventId" element={<CourseManagementPage />} />
                <Route path="bulk-enroll" element={<BulkEnrollmentPage />} />
                <Route path="catalog" element={<CatalogManagementPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </Router>
  );
}

export default App;