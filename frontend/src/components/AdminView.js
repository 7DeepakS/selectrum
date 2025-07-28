import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import Select from 'react-select';

// --- Reusable Modal Component for Editing Events ---
const EditEventModal = ({ isOpen, onClose, event, onSave, distinctDepartments }) => {
    const [formData, setFormData] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Format department strings into { value, label } options for react-select
    const departmentOptions = useMemo(() => {
        return distinctDepartments.filter(d => d !== 'all' && d !== 'N/A').map(dept => ({ value: dept, label: dept }));
    }, [distinctDepartments]);

    useEffect(() => {
        if (event) {
            setFormData({
                name: event.name || '',
                isOpen: event.isOpen || false,
                isViewOnly: event.isViewOnly || false,
                maxCoursesPerStudent: event.maxCoursesPerStudent || 1,
                // Convert department array into the format react-select expects
                allowedDepartments: (event.allowedDepartments || []).map(dept => ({ value: dept, label: dept })),
            });
        }
    }, [event]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    
    const handleSelectChange = (selectedOptions) => {
        setFormData(prev => ({ ...prev, allowedDepartments: selectedOptions || [] }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Convert the react-select options back to a simple array of strings
            const departmentsArray = formData.allowedDepartments.map(opt => opt.value);
            await onSave(event._id, { ...formData, allowedDepartments: departmentsArray });
            onClose();
        } catch (error) {
            console.error("Failed to save event", error);
            // Optionally, show an error message to the user within the modal
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !formData) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Edit Event: {event.name}</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Event Name</label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Max Courses Per Student</label>
                        <input type="number" name="maxCoursesPerStudent" min="1" value={formData.maxCoursesPerStudent} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Allowed Departments</label>
                        <Select
                            isMulti
                            name="allowedDepartments"
                            options={departmentOptions}
                            className="mt-1 basic-multi-select"
                            classNamePrefix="select"
                            value={formData.allowedDepartments}
                            onChange={handleSelectChange}
                            placeholder="Select departments (leave empty for all)"
                        />
                        <p className="text-xs text-gray-500 mt-1">If no departments are selected, all students will be allowed to enroll.</p>
                    </div>
                    <div className="flex items-center space-x-6 pt-2">
                        <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="isOpen" checked={formData.isOpen} onChange={handleChange} className="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500"/><span>Open for Enrollment</span></label>
                        <label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" name="isViewOnly" checked={formData.isViewOnly} onChange={handleChange} className="h-4 w-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"/><span>View-Only Mode</span></label>
                    </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50 hover:bg-blue-700">{isSaving ? 'Saving...' : 'Save Changes'}</button>
                </div>
            </div>
        </div>
    );
};


const reportColumnConfig = {
    username: { label: 'Username', defaultChecked: true },
    name: { label: 'Name', defaultChecked: true },
    department: { label: 'Department', defaultChecked: true },
    eventName: { label: 'Event Name', defaultChecked: false },
};

function AdminView() {
  const [events, setEvents] = useState([]);
  const [distinctDepartments, setDistinctDepartments] = useState(['all']);
  const [selectedEventForStatusTable, setSelectedEventForStatusTable] = useState(''); 
  const [eventStatusByDeptData, setEventStatusByDeptData] = useState(null); 
  const [activityLogs, setActivityLogs] = useState([]);
  const [logFilters, setLogFilters] = useState({ username: '', action: '' });
  const [logPagination, setLogPagination] = useState({ currentPage: 1, totalPages: 1, totalLogs: 0 });
  const [uiMessages, setUiMessages] = useState({ error: '', success: '', info: '' });
  const [loadingStates, setLoadingStates] = useState({
    initialData: true,
    fetchingEventEnrollmentStatus: false,
    isFetchingLogs: false,
    isDownloadingLogs: false,
    isDownloadingChoiceReport: false,
  });
  const [expandedEventCoursesId, setExpandedEventCoursesId] = useState(null);
  const [reportFilterEvent, setReportFilterEvent] = useState('all');
  const [reportFilterDepartment, setReportFilterDepartment] = useState('all');
  const [reportFilterCourse, setReportFilterCourse] = useState('all');
  const [coursesForReportFilter, setCoursesForReportFilter] = useState([]);
  const [reportChoiceNumber, setReportChoiceNumber] = useState(1);
  const [reportSelectedColumns, setReportSelectedColumns] = useState(
    Object.entries(reportColumnConfig).reduce((acc, [key, val]) => ({ ...acc, [key]: val.defaultChecked }), {})
  );
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  const maxChoices = useMemo(() => {
    if (!events || events.length === 0) return 1;
    return events.reduce((max, event) => Math.max(max, event.maxCoursesPerStudent || 1), 1);
  }, [events]);

  const setTimedMessage = (type, message, duration = 7000) => {
    setUiMessages({ error: '', success: '', info: '', [type]: message });
    setTimeout(() => setUiMessages(prev => ({ ...prev, [type]: '' })), duration);
  };
  
  const fetchDashboardData = useCallback(async () => {
    setLoadingStates(p => ({ ...p, initialData: true }));
    try {
        const [eventsRes, deptsRes] = await Promise.all([
            api.get('events/all'),
            api.get('events/enrollment-summary/by-department').catch(() => null)
        ]);
        if (eventsRes.data.success) setEvents(eventsRes.data.data || []);
        if (deptsRes?.data?.success) {
            let depts = ['all', ...(deptsRes.data.data.distinctDepartments || [])];
            setDistinctDepartments([...new Set(depts)].sort((a,b) => {
                if (a === 'all') return -1; if (b === 'all') return 1;
                if (a === 'N/A') return 1; if (b === 'N/A') return -1;
                return String(a).localeCompare(b);
            }));
        }
    } catch (err) { setTimedMessage('error', err.error || 'Failed to load dashboard data.');
    } finally { setLoadingStates(p => ({ ...p, initialData: false })); }
  }, []);

  const fetchActivityLogs = useCallback(async (page = 1) => {
    setLoadingStates(p => ({ ...p, isFetchingLogs: true }));
    try {
        const params = new URLSearchParams({ page, limit: 15 });
        if (logFilters.username) params.append('username', logFilters.username);
        if (logFilters.action) params.append('action', logFilters.action);
        const response = await api.get(`events/activity-logs?${params.toString()}`);
        if (response.data.success) {
            setActivityLogs(response.data.data.logs || []);
            setLogPagination(response.data.data || { currentPage: 1, totalPages: 1, totalLogs: 0 });
        }
    } catch (err) { setTimedMessage('error', err.error || 'Could not fetch logs.');
    } finally { setLoadingStates(p => ({ ...p, isFetchingLogs: false })); }
  }, [logFilters]);
  
  useEffect(() => { fetchDashboardData(); fetchActivityLogs(); }, [fetchDashboardData, fetchActivityLogs]);
  
  useEffect(() => { if (!loadingStates.initialData) fetchActivityLogs(logPagination.currentPage); }, [logPagination.currentPage, fetchActivityLogs, loadingStates.initialData]);
  
  useEffect(() => {
    const fetchStatus = async () => {
        if (!selectedEventForStatusTable) { setEventStatusByDeptData(null); return; }
        setLoadingStates(p => ({ ...p, fetchingEventEnrollmentStatus: true }));
        try {
          const url = `events/${selectedEventForStatusTable}/enrollment-status-by-department`;
          const response = await api.get(url);
          if (response.data.success) setEventStatusByDeptData(response.data.data);
          else setTimedMessage('error', response.data.error);
        } catch (err) { setTimedMessage('error', `Error fetching status: ${err.error || err.message}`);
        } finally { setLoadingStates(p => ({ ...p, fetchingEventEnrollmentStatus: false })); }
    };
    fetchStatus();
  }, [selectedEventForStatusTable]);
  
  useEffect(() => {
    if (reportFilterEvent === 'all') {
        setCoursesForReportFilter([]);
        setReportFilterCourse('all');
    } else {
        const selectedEvent = events.find(e => e._id === reportFilterEvent);
        setCoursesForReportFilter(selectedEvent?.courses || []);
        setReportFilterCourse('all');
    }
  }, [reportFilterEvent, events]);
  
  const handleLogFilterChange = (e) => setLogFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  
  const handleApplyLogFilters = () => { if (logPagination.currentPage !== 1) setLogPagination(p => ({ ...p, currentPage: 1 })); else fetchActivityLogs(1); };
  
  const handleLogPageChange = (newPage) => { if (newPage > 0 && newPage <= logPagination.totalPages) setLogPagination(p => ({ ...p, currentPage: newPage })); };
  
  const handleColumnToggle = (columnName) => setReportSelectedColumns(prev => ({ ...prev, [columnName]: !prev[columnName] }));
  
  const toggleEventCourses = (eventId) => setExpandedEventCoursesId(prevId => (prevId === eventId ? null : eventId));
  
  const handleOpenEditModal = (event) => {
    setEditingEvent(event);
    setIsEditModalOpen(true);
  };

  const handleUpdateEvent = async (eventId, updatedData) => {
    try {
        const response = await api.put(`/events/${eventId}`, updatedData);
        if (response.data.success) {
            let updatedEvent = response.data.data;
            const processedCourses = (updatedEvent.courses || []).map(offering => {
                let totalEnrolled = (offering.slots || []).reduce((sum, slot) => sum + (slot.enrolled || []).length, 0);
                let totalCapacity = (offering.slots || []).reduce((sum, slot) => sum + (slot.maxCapacity || 0), 0);
                return { ...offering, totalEnrolled, totalCapacity };
            });
            updatedEvent.courses = processedCourses;
            setEvents(prevEvents => prevEvents.map(e => e._id === eventId ? updatedEvent : e));
            setTimedMessage('success', 'Event updated successfully!');
        } else {
            setTimedMessage('error', response.data.error);
        }
    } catch (err) {
        setTimedMessage('error', err.error || 'Failed to update event.');
    }
  };
  
  const handleDownloadLogs = async () => {
    setLoadingStates(p => ({ ...p, isDownloadingLogs: true }));
    try {
      const params = new URLSearchParams();
      if (logFilters.username) params.append('username', logFilters.username);
      if (logFilters.action) params.append('action', logFilters.action);
      const response = await api.get(`events/activity-logs/download?${params.toString()}`, { responseType: 'blob' });
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = response.headers['content-disposition']?.split('filename=')[1]?.replace(/"/g, '') || 'activity_logs.csv';
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setTimedMessage('success', 'Logs download started.');
    } catch (err) {
      setTimedMessage('error', err.message || 'Could not download logs.');
    } finally {
      setLoadingStates(p => ({ ...p, isDownloadingLogs: false }));
    }
  };

  const handleDownloadCustomReport = async () => {
    setLoadingStates(p => ({ ...p, isDownloadingChoiceReport: true }));
    try {
        const activeColumns = Object.entries(reportSelectedColumns).filter(([,v]) => v).map(([k]) => k);
        if (activeColumns.length === 0) throw new Error('Please select at least one column.');
        const payload = {
            columns: activeColumns,
            choiceNumber: reportChoiceNumber,
            filters: {
                eventId: reportFilterEvent,
                department: reportFilterDepartment,
                courseId: reportFilterCourse,
            }
        };
        const response = await api.post('events/download/custom-detailed', payload, { responseType: 'blob' });
        
        const blob = response.data;
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName = response.headers['content-disposition']?.split('filename=')[1]?.replace(/"/g, '') || `choice_${reportChoiceNumber}_report.csv`;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        setTimedMessage('success', 'Report download started.');
    } catch (err) { setTimedMessage('error', err.message || 'Could not download the report.');
    } finally { setLoadingStates(p => ({ ...p, isDownloadingChoiceReport: false })); }
  };
  
  if (loadingStates.initialData) return <div className="p-4 text-center">Loading Dashboard Data...</div>;

  return (
    <>
      <EditEventModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} event={editingEvent} onSave={handleUpdateEvent} distinctDepartments={distinctDepartments} />
      <div className="space-y-8 p-4 md:p-6">
        {uiMessages.error && <p className="p-3 my-4 bg-red-100 text-red-700 rounded-md shadow">{uiMessages.error}</p>}
        {uiMessages.success && <p className="p-3 my-4 bg-green-100 text-green-700 rounded-md shadow">{uiMessages.success}</p>}
        {uiMessages.info && <p className="p-3 my-4 bg-blue-100 text-blue-700 rounded-md shadow">{uiMessages.info}</p>}
        
        <section className="p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Event Management</h2>
          <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50"><tr>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">Event Name</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">Restrictions</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">Actions</th>
                  </tr></thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                      {events.map(event => (
                          <React.Fragment key={event._id}>
                              <tr className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{event.name}</td>
                                  <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${event.isOpen ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{event.isOpen ? 'Open' : 'Closed'}</span></td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                      {event.isViewOnly && <div className="text-yellow-800 font-semibold">View-Only</div>}
                                      {(event.allowedDepartments?.length > 0) && <div className="text-blue-800">Dept. Restricted</div>}
                                      {(!event.isViewOnly && (!event.allowedDepartments || event.allowedDepartments.length === 0)) && <span className="text-gray-400">None</span>}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                                      <button onClick={() => toggleEventCourses(event._id)} className="text-indigo-600 hover:text-indigo-900 font-medium mr-4">Courses ({event.courses?.length || 0})</button>
                                      <button onClick={() => handleOpenEditModal(event)} className="text-blue-600 hover:text-blue-900 font-medium">Edit</button>
                                  </td>
                              </tr>
                              {expandedEventCoursesId === event._id && (
                                  <tr>
                                      <td colSpan="4" className="p-4 bg-gray-50">
                                          <div className="p-4 bg-white rounded-md border">
                                              <h4 className="font-semibold text-gray-700 mb-2">Courses in "{event.name}"</h4>
                                              {event.courses && event.courses.length > 0 ? (
                                                  <ul className="list-disc list-inside space-y-2 text-gray-600">
                                                      {event.courses.map(offering => (
                                                          <li key={offering._id}>
                                                              {offering.course?.title || 'Unnamed Course'} - 
                                                              <span className="font-medium text-gray-800"> ({offering.totalEnrolled} / {offering.totalCapacity} Enrolled)</span>
                                                          </li>
                                                      ))}
                                                  </ul>
                                              ) : ( <p className="text-gray-500">No courses assigned to this event.</p> )}
                                          </div>
                                      </td>
                                  </tr>
                              )}
                          </React.Fragment>
                      ))}
                  </tbody>
              </table>
          </div>
        </section>

        <section className="p-6 bg-white rounded-xl shadow-lg">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Event Enrollment Status by Department</h2>
            <div className="flex-1 mb-4 sm:mb-0">
                <label htmlFor="eventStatusTableSelect" className="block text-sm font-medium text-gray-700 mb-1">Select Event to View Status:</label>
                <select id="eventStatusTableSelect" value={selectedEventForStatusTable} onChange={(e) => setSelectedEventForStatusTable(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500">
                    <option value="">-- Select Event --</option>
                    {events.map(event => <option key={event._id} value={event._id}>{event.name}</option>)}
                </select>
            </div>
            {loadingStates.fetchingEventEnrollmentStatus && <p className="mt-4 text-center animate-pulse">Fetching status...</p>}
            {eventStatusByDeptData && !loadingStates.fetchingEventEnrollmentStatus && (
                <div className="mt-6">
                    <h3 className="text-xl font-semibold text-gray-800 mb-3">Status for: <span className="text-indigo-600">{eventStatusByDeptData.eventName}</span></h3>
                    {(eventStatusByDeptData.departmentalStatus || []).length > 0 ? (
                        <div className="overflow-x-auto shadow border-b rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-100"><tr>
                                <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">Department</th>
                                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider">Total Students</th>
                                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider">Enrolled</th>
                                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider">Not Enrolled</th>
                                <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider">% Enrolled</th>
                            </tr></thead><tbody className="bg-white divide-y">
                            {eventStatusByDeptData.departmentalStatus.map((d) => (
                                <tr key={d.department} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium whitespace-nowrap">{d.department}</td>
                                    <td className="px-6 py-4 text-center">{d.total_students}</td>
                                    <td className="px-6 py-4 text-green-700 font-medium text-center">{d.signed_in_students}</td>
                                    <td className="px-6 py-4 text-red-700 font-medium text-center">{d.not_signed_in_students}</td>
                                    <td className="px-6 py-4 text-center">{d.percentage_signed_in}%</td>
                                </tr>
                            ))}</tbody></table>
                        </div>
                    ) : <p className="mt-4 text-gray-500">No departmental enrollment data to display for this event.</p>}
                </div>
            )}
        </section>
        
        <section className="p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Download Custom Choice Report</h2>
          <div className="p-4 border-2 border-indigo-200 rounded-lg bg-indigo-50 space-y-6">
              <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">1. Select Columns</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {Object.entries(reportColumnConfig).map(([key, val]) => (
                          <label key={key} className="flex items-center space-x-2 p-2 rounded-md hover:bg-indigo-100 cursor-pointer">
                              <input type="checkbox" checked={!!reportSelectedColumns[key]} onChange={() => handleColumnToggle(key)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"/>
                              <span>{val.label}</span>
                          </label>
                      ))}
                  </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                      <label htmlFor="reportFilterEvent" className="block text-sm font-medium text-gray-600 mb-1">Event:</label>
                      <select id="reportFilterEvent" value={reportFilterEvent} onChange={(e) => setReportFilterEvent(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg">
                          <option value="all">All Events</option>
                          {events.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
                      </select>
                  </div>
                  <div>
                      <label htmlFor="reportFilterCourse" className="block text-sm font-medium text-gray-600 mb-1">Course:</label>
                      <select id="reportFilterCourse" value={reportFilterCourse} onChange={(e) => setReportFilterCourse(e.target.value)} disabled={reportFilterEvent === 'all'} className="w-full p-2 border border-gray-300 rounded-lg disabled:bg-gray-100">
                          <option value="all">All Courses in Event</option>
                          {coursesForReportFilter.map(offering => <option key={offering.course?._id} value={offering.course?._id}>{offering.course?.title}</option>)}
                      </select>
                  </div>
                  <div>
                      <label htmlFor="reportFilterDept" className="block text-sm font-medium text-gray-600 mb-1">Department:</label>
                      <select id="reportFilterDept" value={reportFilterDepartment} onChange={(e) => setReportFilterDepartment(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg">
                          {distinctDepartments.map(d => <option key={d} value={d}>{d === 'all' ? 'All Departments' : d}</option>)}
                      </select>
                  </div>
              </div>
              <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">3. Select Enrollment Choice</h3>
                   <select value={reportChoiceNumber} onChange={(e) => setReportChoiceNumber(e.target.value)} className="w-full sm:w-auto p-3 border border-gray-300 rounded-lg">
                      {Array.from({ length: maxChoices }, (_, i) => i + 1).map(num => (
                          <option key={num} value={num}>{num === 1 ? '1st Choice' : num === 2 ? '2nd Choice' : num === 3 ? '3rd Choice' : `${num}th Choice`}</option>
                      ))}
                  </select>
              </div>
              <div className="pt-4 border-t">
                  <button onClick={handleDownloadCustomReport} disabled={loadingStates.isDownloadingChoiceReport} className="w-full p-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {loadingStates.isDownloadingChoiceReport ? 'Generating Report...' : 'Download Report'}
                  </button>
              </div>
          </div>
        </section>

        <section className="p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">User Activity Logs</h2>
          <div className="p-4 mb-4 bg-gray-50 rounded-lg border flex flex-col sm:flex-row gap-4 items-center flex-wrap">
              <div className="flex-grow w-full sm:w-auto"><label htmlFor="logFilterUsername" className="text-sm font-medium">Username</label><input id="logFilterUsername" type="text" name="username" value={logFilters.username} onChange={handleLogFilterChange} className="mt-1 w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"/></div>
              <div className="flex-grow w-full sm:w-auto"><label htmlFor="logFilterAction" className="text-sm font-medium">Action</label><select id="logFilterAction" name="action" value={logFilters.action} onChange={handleLogFilterChange} className="mt-1 w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"><option value="">All</option><option value="LOGIN_SUCCESS">Login</option><option value="ENROLL_SUCCESS">Enroll Success</option><option value="ENROLL_FAIL">Enroll Fail</option></select></div>
              <div className="flex-shrink-0 pt-6 flex space-x-2">
                   <button onClick={handleApplyLogFilters} className="p-2 h-10 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors" disabled={loadingStates.isFetchingLogs}>{loadingStates.isFetchingLogs ? '...' : 'Search'}</button>
                   <button onClick={handleDownloadLogs} className="p-2 h-10 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors" disabled={loadingStates.isDownloadingLogs}>{loadingStates.isDownloadingLogs ? '...' : 'Download'}</button>
              </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Timestamp</th><th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Action</th><th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">User</th><th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Details</th></tr></thead>
              <tbody className="bg-white divide-y">
                {loadingStates.isFetchingLogs ? (<tr><td colSpan="4" className="text-center p-4">Loading...</td></tr>)
                 : activityLogs.length === 0 ? (<tr><td colSpan="4" className="text-center p-4">No logs found.</td></tr>)
                 : (activityLogs.map(log => (<tr key={log._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap"><span className="text-sm">{new Date(log.createdAt).toLocaleString()}</span></td>
                      <td className="px-4 py-4 whitespace-nowrap"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${log.action.includes('SUCCESS') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{log.action}</span></td>
                      <td className="px-4 py-4 text-sm whitespace-nowrap"><div>{log.user?.name || log.username}</div><div className="text-xs text-gray-500">{log.user?.department || 'N/A'}</div></td>
                      <td className="px-4 py-4 text-sm">{log.details && (<>{log.details.ip && <div>IP: {log.details.ip}</div>}{log.details.eventName && <div>Event: {log.details.eventName}</div>}{log.details.courseTitle && <div>Course: {log.details.courseTitle}</div>}{log.details.errorMessage && <div className="text-red-600">Error: {log.details.errorMessage}</div>}</>)}</td>
                    </tr>)))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-700">Page {logPagination.currentPage} of {logPagination.totalPages} ({logPagination.totalLogs} total)</p>
              <div className="space-x-2">
                  <button onClick={() => handleLogPageChange(logPagination.currentPage-1)} disabled={logPagination.currentPage<=1 || loadingStates.isFetchingLogs} className="p-2 border rounded-md text-sm disabled:opacity-50">Prev</button>
                  <button onClick={() => handleLogPageChange(logPagination.currentPage+1)} disabled={logPagination.currentPage>=logPagination.totalPages || loadingStates.isFetchingLogs} className="p-2 border rounded-md text-sm disabled:opacity-50">Next</button>
              </div>
          </div>
        </section>
      </div>
    </>
  );
}
export default AdminView;