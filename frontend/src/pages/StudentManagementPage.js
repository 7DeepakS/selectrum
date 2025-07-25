// src/pages/StudentManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const initialNewStudentState = { username: '', name: '', password: '', department: '' };

function StudentManagementPage() {
  const [students, setStudents] = useState([]);
  const [newStudent, setNewStudent] = useState(initialNewStudentState);
  const [csvFile, setCsvFile] = useState(null);
  const [uiMessages, setUiMessages] = useState({ error: '', success: '' });
  const [loadingStates, setLoadingStates] = useState({
    fetchingStudents: true,
    addingStudent: false,
    deletingStudent: null,
    uploadingCsv: false,
  });

  const setTimedMessage = (type, message, duration = 5000) => {
    setUiMessages({ error: '', success: '', [type]: message });
    setTimeout(() => setUiMessages(prev => ({ ...prev, [type]: '' })), duration);
  };

  const fetchStudents = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, fetchingStudents: true }));
    try {
      const response = await api.get('users/students');
      if (response.data.success) {
        setStudents(response.data.data || []);
      } else {
        setTimedMessage('error', response.data.error || 'Failed to load students.');
      }
    } catch (err) {
      setTimedMessage('error', err.error || 'Could not fetch students.');
    } finally {
      setLoadingStates(prev => ({ ...prev, fetchingStudents: false }));
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleNewStudentChange = (e) => {
    setNewStudent(p => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudent.username.trim() || !newStudent.name.trim() || !newStudent.password) {
      setTimedMessage('error', 'Username, name, and password are required.');
      return;
    }
    setLoadingStates(prev => ({ ...prev, addingStudent: true }));
    try {
      const response = await api.post('users/add-student', newStudent);
      if (response.data.success) {
        setNewStudent(initialNewStudentState);
        fetchStudents();
        setTimedMessage('success', `Student "${response.data.data.username}" added successfully.`);
      } else {
        setTimedMessage('error', `Failed to add student: ${response.data.error}`);
      }
    } catch (err) {
      setTimedMessage('error', `Failed to add student: ${err.error || err.message}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, addingStudent: false }));
    }
  };

  const handleUploadCSV = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      setTimedMessage('error', 'Please select a CSV file to upload.');
      return;
    }
    setLoadingStates(prev => ({ ...prev, uploadingCsv: true }));
    const formData = new FormData();
    formData.append('csv', csvFile);
    try {
      const response = await api.post('events/upload-students', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (response.data.success || response.status === 207) {
        setCsvFile(null);
        const fileInput = document.getElementById('csv-upload-input');
        if (fileInput) fileInput.value = '';
        let message = response.data.message || 'CSV processed.';
        if (response.data.errors?.length > 0) {
          message += ` ${response.data.errors.length} row(s) had errors. Check console for details.`;
          console.warn("CSV Upload failures:", response.data.errors);
        }
        setTimedMessage('success', message);
        fetchStudents();
      } else {
        setTimedMessage('error', `CSV upload failed: ${response.data.error}`);
      }
    } catch (err) {
      setTimedMessage('error', err.error || 'An unexpected error occurred during CSV upload.');
      if (err.details?.errors) console.error("CSV Upload row errors:", err.details.errors);
    } finally {
      setLoadingStates(prev => ({ ...prev, uploadingCsv: false }));
    }
  };

  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to delete the student "${studentName}"? This is irreversible and will un-enroll them from all events.`)) return;
    setLoadingStates(prev => ({ ...prev, deletingStudent: studentId }));
    try {
      const response = await api.delete(`users/${studentId}`);
      if (response.data.success) {
        setTimedMessage('success', response.data.message);
        fetchStudents();
      } else {
        setTimedMessage('error', response.data.error);
      }
    } catch (err) {
      setTimedMessage('error', err.error);
    } finally {
      setLoadingStates(prev => ({ ...prev, deletingStudent: null }));
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold text-gray-800">Student Management</h1>
      <p className="text-lg text-gray-600">Add, upload, view, and manage student accounts.</p>
      
      {uiMessages.error && <p className="p-3 my-4 bg-red-100 text-red-700 rounded-md shadow-sm">{uiMessages.error}</p>}
      {uiMessages.success && <p className="p-3 my-4 bg-green-100 text-green-700 rounded-md shadow-sm">{uiMessages.success}</p>}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <section className="p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Add New Student</h2>
          <form onSubmit={handleAddStudent} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input id="username" type="text" name="username" value={newStudent.username} onChange={handleNewStudentChange} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input id="name" type="text" name="name" value={newStudent.name} onChange={handleNewStudentChange} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Initial Password</label>
              <input id="password" type="password" name="password" value={newStudent.password} onChange={handleNewStudentChange} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="Min. 6 characters" />
            </div>
            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">Department (Optional)</label>
              <input id="department" type="text" name="department" value={newStudent.department} onChange={handleNewStudentChange} className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <button type="submit" className="w-full p-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50" disabled={loadingStates.addingStudent}>
              {loadingStates.addingStudent ? 'Adding...' : 'Add Student'}
            </button>
          </form>
        </section>

        <section className="p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Upload Students via CSV</h2>
          <p className="text-sm text-gray-600 mb-4">File must have lowercase headers: <code>username</code>, <code>name</code>, <code>password</code>. Optional: <code>department</code>.</p>
          <form onSubmit={handleUploadCSV} className="space-y-4">
            <div>
              <label htmlFor="csv-upload-input" className="block text-sm font-medium text-gray-700 mb-1">Select CSV File</label>
              <input id="csv-upload-input" type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files[0])} required className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-gray-300 rounded-lg cursor-pointer p-2"/>
            </div>
            <button type="submit" className="w-full p-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition disabled:opacity-50" disabled={loadingStates.uploadingCsv || !csvFile}>
              {loadingStates.uploadingCsv ? 'Uploading...' : 'Upload CSV'}
            </button>
          </form>
        </section>
      </div>

      <section className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-2xl font-semibold mb-4">Student List</h2>
        <div className="overflow-x-auto">
            {loadingStates.fetchingStudents ? <p className="text-center p-4 animate-pulse">Loading students...</p> : (
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {students.length === 0 ? (
                            <tr><td colSpan="4" className="text-center p-4 text-gray-500">No students found in the system.</td></tr>
                        ) : students.map((student) => (
                            <tr key={student._id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.username}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.department || 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleDeleteStudent(student._id, student.name)}
                                        disabled={loadingStates.deletingStudent === student._id}
                                        className="text-red-600 hover:text-red-900 disabled:text-gray-400 disabled:cursor-not-allowed font-semibold"
                                    >
                                        {loadingStates.deletingStudent === student._id ? 'Deleting...' : 'Delete'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
      </section>
    </div>
  );
}
export default StudentManagementPage;