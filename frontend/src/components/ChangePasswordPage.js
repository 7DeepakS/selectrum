// src/components/ChangePasswordPage.js
import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';

function ChangePasswordPage() {
  const { user, updateUserContext, logout, isAuthenticated, loading: authLoading } = useContext(AuthContext);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pageLoading, setPageLoading] = useState(false);

  // Redirect if not authenticated or if password change is no longer required
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      console.log('CHANGE_PW_PAGE: Not authenticated, redirecting to login.');
      navigate('/');
    } else if (!authLoading && user && !user.requiresPasswordChange) {
      // If user is loaded and doesn't need a change, send to dashboard
      // This handles cases like bookmarking/reloading the change password page after already changing it
      console.log('CHANGE_PW_PAGE: Password change not required, redirecting to dashboard.');
      navigate(user.role === 'admin' ? '/admin' : '/student', { replace: true });
    }
  }, [user, isAuthenticated, authLoading, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.newPassword !== formData.confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (formData.newPassword.length < 6) { // Match backend validation
      setError('New password must be at least 6 characters long.');
      return;
    }

    setPageLoading(true);
    try {
      const payload = {
        newPassword: formData.newPassword,
        confirmNewPassword: formData.confirmNewPassword,
      };

      // Only send currentPassword if the user doesn't *require* a change (i.e., it's a voluntary change)
      // OR if you always want to force them to enter it.
      // The backend logic handles if currentPassword is empty & requiresPasswordChange is true.
      // For simplicity here, we'll send it if user.requiresPasswordChange is false.
      if (user && !user.requiresPasswordChange && formData.currentPassword) {
        payload.currentPassword = formData.currentPassword;
      } else if (user && !user.requiresPasswordChange && !formData.currentPassword) {
        setError('Current password is required for a voluntary password change.');
        setPageLoading(false);
        return;
      }


      const response = await api.post('/users/change-password', payload);

      if (response.data.success) {
        setSuccess('Password changed successfully! Redirecting to your dashboard...');
        updateUserContext(response.data.user); // Update user (requiresPasswordChange will be false)
        
        setTimeout(() => {
          navigate(response.data.user.role === 'admin' ? '/admin' : '/student');
        }, 2000);
      } else {
        setError(response.data.error || 'Failed to change password.');
      }
    } catch (err) {
      console.error("Change password API error object:", err);
      if (err.isAxiosError && err.response) {
        setError(err.response.data.error || `Server error: ${err.response.status}`);
      } else {
        setError(err.error || err.message || 'An error occurred while changing password.');
      }
    } finally {
      setPageLoading(false);
    }
  };
  
  if (authLoading || (!user && isAuthenticated)) { // If auth is loading, or authenticated but user object not yet set
    return <div className="p-6 text-center text-lg">Loading...</div>;
  }

  // This check handles the case where the user might already be redirected by useEffect
  // but the component tries to render before the redirect completes.
  if (!isAuthenticated && !authLoading) return <Navigate to="/" replace />;
  if (user && !user.requiresPasswordChange && !authLoading) return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;


  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-teal-400 via-blue-500 to-indigo-600 p-4">
      <div className="p-8 bg-white rounded-xl shadow-2xl w-full max-w-md">
        <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">
          {user && user.requiresPasswordChange ? 'Set Your New Password' : 'Change Your Password'}
        </h2>

        {error && <p className="text-red-600 text-center mb-4 p-3 bg-red-100 border border-red-400 rounded-md">{error}</p>}
        {success && <p className="text-green-600 text-center mb-4 p-3 bg-green-100 border border-green-400 rounded-md">{success}</p>}

        {!success && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Only show current password field if it's NOT the initial forced change */}
            {user && !user.requiresPasswordChange && (
                 <div>
                    <label htmlFor="currentPassword" className="block text-sm font-semibold text-gray-700">Current Password</label>
                    <input
                        type="password"
                        name="currentPassword"
                        id="currentPassword"
                        value={formData.currentPassword}
                        onChange={handleChange}
                        className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                        required 
                    />
                </div>
            )}
           
            <div>
              <label htmlFor="newPassword" className="block text-sm font-semibold text-gray-700">New Password</label>
              <input
                type="password"
                name="newPassword"
                id="newPassword"
                value={formData.newPassword}
                onChange={handleChange}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="confirmNewPassword" className="block text-sm font-semibold text-gray-700">Confirm New Password</label>
              <input
                type="password"
                name="confirmNewPassword"
                id="confirmNewPassword"
                value={formData.confirmNewPassword}
                onChange={handleChange}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                required
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={pageLoading}
              className="w-full p-3 rounded-lg text-white font-semibold bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pageLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
        {!success && (
             <button
                onClick={() => logout()}
                className="mt-6 w-full text-center text-sm text-gray-600 hover:text-indigo-600 hover:underline"
                disabled={pageLoading}
            >
                Or, Logout
            </button>
        )}
      </div>
    </div>
  );
}

export default ChangePasswordPage;