// src/pages/ChangePasswordPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

function ChangePasswordPage() {
  // Get the correct 'updateUser' function and the 'user' object from our custom hook
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // This flag makes the logic clearer
  const isForcedChange = user?.requiresPasswordChange;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPasswords(prev => ({ ...prev, [name]: value }));
    // Clear errors when user types
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (passwords.newPassword !== passwords.confirmNewPassword) {
      return setError('New passwords do not match.');
    }
    if (passwords.newPassword.length < 6) {
      return setError('Password must be at least 6 characters long.');
    }
    if (!isForcedChange && !passwords.currentPassword) {
        return setError('Current password is required.');
    }

    setIsLoading(true);
    try {
      const payload = {
        newPassword: passwords.newPassword,
        // The backend expects the confirm password field for validation
        confirmNewPassword: passwords.confirmNewPassword, 
      };
      // Only include currentPassword if it's not a forced change
      if (!isForcedChange) {
        payload.currentPassword = passwords.currentPassword;
      }
      
      const response = await api.post('users/change-password', payload);
      
      setSuccess('Password changed successfully! Redirecting...');
      
      // Update the user in our global context and localStorage
      updateUser(response.data.user);

      // Redirect to the appropriate dashboard after 2 seconds
      setTimeout(() => {
        const redirectTo = user.role === 'admin' ? '/admin' : '/student-dashboard';
        navigate(redirectTo, { replace: true });
      }, 2000);

    } catch (err) {
      console.error("Change password API error:", err);
      setError(err.error || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-800">
          {isForcedChange ? 'Create Your New Password' : 'Change Your Password'}
        </h2>
        
        {isForcedChange && (
            <p className="text-center text-sm text-yellow-700 bg-yellow-100 p-3 rounded-md border border-yellow-200">
                For security, you must set a new password before proceeding.
            </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isForcedChange && (
              <div>
                <label className="block text-sm font-medium">Current Password</label>
                <input 
                  type="password" 
                  name="currentPassword" 
                  value={passwords.currentPassword} 
                  onChange={handleInputChange} 
                  required 
                  className="w-full p-2 mt-1 border rounded-md" 
                />
              </div>
          )}
          <div>
            <label className="block text-sm font-medium">New Password</label>
            <input 
              type="password" 
              name="newPassword" 
              value={passwords.newPassword} 
              onChange={handleInputChange} 
              required 
              className="w-full p-2 mt-1 border rounded-md" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Confirm New Password</label>
            <input 
              type="password" 
              name="confirmNewPassword" 
              value={passwords.confirmNewPassword} 
              onChange={handleInputChange} 
              required 
              className="w-full p-2 mt-1 border rounded-md" 
            />
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          {success && <p className="text-sm text-green-600 text-center animate-pulse">{success}</p>}
          
          <div>
            <button type="submit" disabled={isLoading} className="w-full p-3 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePasswordPage;