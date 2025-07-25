// src/layouts/MainLayout.js
import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MainLayout = () => {
  const { user, logout } = useAuth();

  if (!user) {
    return null; 
  }

  const isAdmin = user.role === 'admin';

  const navLinkClass = ({ isActive }) => 
    `block p-2 rounded-md transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'hover:bg-gray-700'}`;

  return (
    <div className={`min-h-screen bg-gray-100 ${isAdmin ? 'flex' : ''}`}>
      {/* Admin-only Sidebar Navigation */}
      {isAdmin && (
        <nav className="w-64 bg-gray-800 text-white p-5 flex-shrink-0 flex flex-col">
          <div>
            <h2 className="font-bold text-2xl mb-10 text-center">Selectrum Admin</h2>
            <ul className="space-y-3">
              <li><NavLink to="/admin" end className={navLinkClass}>Dashboard</NavLink></li>
              <li><NavLink to="/admin/students" className={navLinkClass}>Manage Students</NavLink></li>
              <li><NavLink to="/admin/events" className={navLinkClass}>Manage Events</NavLink></li>
            </ul>
          </div>
          <div className="mt-auto">
            <button 
              onClick={logout} 
              className="w-full p-2 rounded bg-red-600 hover:bg-red-700 font-semibold transition-colors"
            >
              Logout
            </button>
          </div>
        </nav>
      )}

      {/* Main Content Area (for all users) */}
      <div className="flex-1 flex flex-col">
        {/* Top Navbar - ONLY for non-admins (students) */}
        {!isAdmin && (
            // ======================= COLOR FIX IS HERE =======================
            <header className="bg-indigo-700 text-white p-4 shadow-lg sticky top-0 z-10">
            {/* =============================================================== */}
                <div className="container mx-auto flex justify-between items-center">
                    <div className="font-bold text-xl">
                        Selectrum Portal
                    </div>
                    <div className="flex items-center">
                        {/* Text color updated for better contrast on blue */}
                        <span className="mr-4 text-indigo-100 hidden sm:inline">Welcome, {user.name}!</span>
                        <button 
                          onClick={logout} 
                          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md shadow hover:shadow-md transition"
                        >
                          Logout
                        </button>
                    </div>
                </div>
            </header>
        )}
        
        <main className={`p-4 md:p-8 ${isAdmin ? 'overflow-y-auto' : 'container mx-auto'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;