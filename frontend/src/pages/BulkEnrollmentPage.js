import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import api from '../services/api';
import { ArrowLeft, CheckCircle, XCircle, AlertCircle } from 'react-feather';

function BulkEnrollmentPage() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState('');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('events/all');
      setEvents(response.data.data || []);
    } catch (err) {
      setError('Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleUpload = async e => {
    e.preventDefault();
    if (!selectedEvent || !csvFile) {
      setError('Please select an event and a CSV file.');
      return;
    }
    setIsUploading(true);
    setUploadResult(null);
    setError('');
    const formData = new FormData();
    formData.append('csv', csvFile);
    formData.append('eventId', selectedEvent);

    try {
      // Corrected endpoint
      const response = await api.post('events/admin/bulk-enroll', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResult(response.data.data);
    } catch (err) {
      setError(err.error || 'An error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDismissError = () => setError('');

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-indigo-50">
        <div className="flex items-center space-x-2 text-xl font-semibold text-indigo-600">
          <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z"></path>
          </svg>
          <span>Loading events...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 md:p-0">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-indigo-700">Bulk Enrollment via CSV</h1>
        <NavLink
          to="/admin"
          className="flex items-center text-indigo-600 hover:text-indigo-800 transition"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Dashboard
        </NavLink>
      </header>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg flex items-center space-x-2" role="alert">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
          <button
            onClick={handleDismissError}
            className="ml-auto text-sm font-semibold hover:underline"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="p-6 bg-white rounded-xl shadow-lg">
        <form onSubmit={handleUpload} className="space-y-6">
          <p className="text-sm text-gray-600">
            CSV file must have headers: <code className="bg-gray-100 px-1 rounded">username</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">coursetitle</code>.
          </p>
          <div>
            <label htmlFor="eventSelect" className="block text-sm font-medium text-gray-700 mb-1">
              1. Select Event to Enroll Students In:
            </label>
            <select
              id="eventSelect"
              value={selectedEvent}
              onChange={e => setSelectedEvent(e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              aria-describedby="eventSelectHelp"
            >
              <option value="">-- Choose an Event --</option>
              {events.map(e => (
                <option key={e._id} value={e._id}>
                  {e.name}
                </option>
              ))}
            </select>
            <p id="eventSelectHelp" className="text-xs text-gray-500 mt-1">
              Select the event for which to enroll students.
            </p>
          </div>
          <div>
            <label htmlFor="csvSelect" className="block text-sm font-medium text-gray-700 mb-1">
              2. Select CSV File:
            </label>
            <input
              id="csvSelect"
              type="file"
              accept=".csv"
              onChange={e => setCsvFile(e.target.files[0])}
              required
              className="w-full p-2 border border-gray-300 rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 transition"
              aria-describedby="csvSelectHelp"
            />
            <p id="csvSelectHelp" className="text-xs text-gray-500 mt-1">
              Upload a CSV file with student enrollment details.
            </p>
          </div>
          <button
            type="submit"
            disabled={isUploading || !selectedEvent || !csvFile}
            className="w-full p-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 focus:ring-2 focus:ring-indigo-500"
          >
            {isUploading ? (
              <span className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              'Upload and Enroll Students'
            )}
          </button>
        </form>
      </section>

      {uploadResult && (
        <section className="p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold text-indigo-700 mb-4">Upload Results</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-green-100 rounded-lg flex items-center space-x-2">
              <CheckCircle className="w-6 h-6 text-green-700" />
              <div>
                <p className="text-2xl font-bold text-green-700">{uploadResult.successes.length}</p>
                <p className="text-sm font-medium text-green-600">Successful Enrollments</p>
              </div>
            </div>
            <div className="p-4 bg-red-100 rounded-lg flex items-center space-x-2">
              <XCircle className="w-6 h-6 text-red-700" />
              <div>
                <p className="text-2xl font-bold text-red-700">{uploadResult.failures.length}</p>
                <p className="text-sm font-medium text-red-600">Failed Rows</p>
              </div>
            </div>
          </div>
          {uploadResult.failures.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-700 mb-2">Failure Details:</h3>
              <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Course Title</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {uploadResult.failures.map((fail, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-600">{fail.row}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{fail.username}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{fail.courseTitle}</td>
                        <td className="px-4 py-2 text-sm text-red-600">{fail.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default BulkEnrollmentPage;