// src/pages/AdminDashboardPage.js
import React from 'react';
import AdminView from '../components/AdminView';

function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-4xl font-bold text-gray-800 mb-2">Admin Dashboard</h1>
      <p className="mb-8 text-lg text-gray-600">System activity and event status overview.</p>
      
      {/* This component will now only contain the widgets */}
      <AdminView />
    </div>
  );
}

export default AdminDashboardPage;