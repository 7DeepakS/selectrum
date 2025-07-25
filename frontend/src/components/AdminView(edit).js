// src/components/AdminView.js
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const availableReportColumns = {
    eventName: { label: 'Event Name', defaultChecked: true },
    courseTitle: { label: 'Course Title', defaultChecked: true },
    studentName: { label: 'Student Name', defaultChecked: true },
    studentDepartment: { label: 'Student Department', defaultChecked: true },
    studentUsername: { label: 'Student Username', defaultChecked: false },
    eventIsOpen: { label: 'Event Open', defaultChecked: false },
    courseDescription: { label: 'Course Description', defaultChecked: false },
    slotTime: { label: 'Slot Time', defaultChecked: false },
    slotMaxCapacity: { label: 'Slot Max Capacity', defaultChecked: false },
    slotIsActive: { label: 'Slot Active', defaultChecked: false },
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
    downloadingCustomDetailedReport: false, 
  });

  const [selectedScopeType, setSelectedScopeType] = useState('department');
  const [selectedDepartmentForDownload, setSelectedDepartmentForDownload] = useState('all');
  const [selectedEventForReport, setSelectedEventForReport] = useState('');
  const [selectedCourseForReport, setSelectedCourseForReport] = useState('');
  const [coursesInSelectedEvent, setCoursesInSelectedEvent] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState(
    Object.entries(availableReportColumns).reduce((acc, [key, val]) => {
        acc[key] = val.defaultChecked;
        return acc;
    }, {})
  );

  const setTimedMessage = (type, message, duration = 7000) => {
    setUiMessages({ error: '', success: '', info: '', [type]: message });
    setTimeout(() => setUiMessages(prev => ({ ...prev, [type]: '' })), duration);
  };

  const fetchDashboardData = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, initialData: true }));
    try {
        const [eventsResponse, deptsResponse] = await Promise.all([
            api.get('events'),
            api.get('events/enrollment-summary/by-department').catch(() => null)
        ]);
        if (eventsResponse.data.success) { setEvents(eventsResponse.data.data || []); }
        if (deptsResponse?.data?.success) {
            let depts = ['all', ...(deptsResponse.data.data.distinctDepartments || [])];
            depts = [...new Set(depts)].sort((a, b) => {
                if (a === 'all') return -1; if (b === 'all') return 1;
                if (a === 'N/A') return 1; if (b === 'N/A') return -1;
                return String(a).localeCompare(b);
            });
            setDistinctDepartments(depts);
        }
    } catch (err) {
        setTimedMessage('error', `Failed to load dashboard data: ${err.error || err.message}`);
    } finally {
        setLoadingStates(prev => ({ ...prev, initialData: false }));
    }
  }, []);

  const fetchActivityLogs = useCallback(async (page = 1) => {
    setLoadingStates(prev => ({ ...prev, isFetchingLogs: true }));
    try {
        const params = new URLSearchParams({ page, limit: 15 });
        if (logFilters.username) params.append('username', logFilters.username);
        if (logFilters.action) params.append('action', logFilters.action);
        const response = await api.get(`events/activity-logs?${params.toString()}`);
        if (response.data.success) {
            setActivityLogs(response.data.data.logs);
            setLogPagination(response.data.data);
        }
    } catch (err) {
        setTimedMessage('error', `Could not fetch activity logs: ${err.error || err.message}`);
    } finally {
        setLoadingStates(prev => ({ ...prev, isFetchingLogs: false }));
    }
  }, [logFilters]);

  useEffect(() => {
    fetchDashboardData();
    fetchActivityLogs();
  }, [fetchDashboardData]);

  useEffect(() => {
    if(!loadingStates.initialData) fetchActivityLogs(logPagination.currentPage);
  }, [logPagination.currentPage]);

  useEffect(() => { 
      if ((selectedScopeType === 'course' || selectedScopeType === 'event') && selectedEventForReport) {
          const event = events.find(e => e._id === selectedEventForReport);
          setCoursesInSelectedEvent(event ? (event.courses || []) : []);
          if(selectedScopeType === 'course') setSelectedCourseForReport(''); 
      } else {
          setCoursesInSelectedEvent([]);
          if(selectedScopeType === 'course') setSelectedCourseForReport('');
      }
  }, [selectedEventForReport, selectedScopeType, events]);

  useEffect(() => { setEventStatusByDeptData(null); }, [selectedEventForStatusTable]);
  
  const handleColumnToggle = (columnName) => { setSelectedColumns(prev => ({ ...prev, [columnName]: !prev[columnName] })); };

  const handleDownloadCustomDetailedReport = async () => { 
    let reportScopePayload = {};
    let scopeDescription = "";
    if (selectedScopeType === 'department') {
        if (!selectedDepartmentForDownload) { setTimedMessage('error', 'Please select a department.'); return; }
        reportScopePayload = { type: 'department', value: selectedDepartmentForDownload };
        scopeDescription = selectedDepartmentForDownload === 'all' ? 'All_Departments' : `Dept_${selectedDepartmentForDownload}`;
    } else if (selectedScopeType === 'event') {
        if (!selectedEventForReport) { setTimedMessage('error', 'Please select an event.'); return; }
        reportScopePayload = { type: 'event', value: selectedEventForReport };
        const eventObj = events.find(e => e._id === selectedEventForReport);
        scopeDescription = eventObj ? `Event_${eventObj.name}` : `Event_${selectedEventForReport}`;
    } else if (selectedScopeType === 'course') {
        if (!selectedEventForReport || !selectedCourseForReport) { setTimedMessage('error', 'Please select an event and a course.'); return; }
        reportScopePayload = { type: 'course', eventId: selectedEventForReport, courseId: selectedCourseForReport };
        const eventObj = events.find(e => e._id === selectedEventForReport);
        const courseObj = coursesInSelectedEvent.find(c => c._id === selectedCourseForReport);
        scopeDescription = `Event_${eventObj?.name}_Course_${courseObj?.title}`;
    } else { setTimedMessage('error', 'Invalid report scope.'); return; }

    const activeColumns = Object.entries(selectedColumns).filter(([, value]) => value).map(([key]) => key);
    if (activeColumns.length === 0) { setTimedMessage('error', 'Please select at least one column.'); return; }

    setLoadingStates(prev => ({ ...prev, downloadingCustomDetailedReport: true }));
    try {
        const endpoint = `events/download/custom-detailed`; 
        const response = await api.post(endpoint, { scope: reportScopePayload, columns: activeColumns }, { responseType: 'blob' });
        const blob = response.data;
        if (!(blob instanceof Blob)) { throw new Error('Response was not a Blob.'); }
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const contentDisposition = response.headers['content-disposition'];
        let fileName = `custom_report_${scopeDescription.replace(/[^\w-]/g, '_').substring(0, 50)}.csv`;
        if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
            if (fileNameMatch && fileNameMatch.length > 1) fileName = fileNameMatch[1];
        }
        link.setAttribute('download', fileName); document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
        setTimedMessage('success', `Custom report for "${scopeDescription.replace(/_/g, ' ')}" download started.`);
    } catch (err) {
        let finalErrorMessage = `Custom report download error: `;
        if (err.response && err.response.data instanceof Blob && (err.response.data.type.includes('application/json') || err.response.data.type.includes('text/plain'))) {
            try {
                const errorText = await err.response.data.text(); console.error("Error Blob Content:", errorText);
                if (err.response.data.type.includes('application/json')) { const errorJson = JSON.parse(errorText); finalErrorMessage += errorJson.error || errorJson.message || 'Err.'; }
                else { finalErrorMessage += errorText; }
            } catch (parseError) { finalErrorMessage += `Could not parse error. ${err.message || ''}`; }
        } else if (err.response && err.response.data) { finalErrorMessage += err.response.data.error || err.response.data.message || 'Server error.'; console.error("Server JSON error:", err.response.data);
        } else { finalErrorMessage += err.message || 'Could not process download.'; }
        setTimedMessage('error', finalErrorMessage);
    } finally { setLoadingStates(prev => ({ ...prev, downloadingCustomDetailedReport: false })); }
   };
  const handleFetchEventStatusByDept = async () => { if (!selectedEventForStatusTable) {
      setTimedMessage('error', 'Please select an event to view its enrollment status.');
      return;
    }
    setLoadingStates(prev => ({ ...prev, fetchingEventEnrollmentStatus: true }));
    setEventStatusByDeptData(null); 

    try {
      const url = `events/${selectedEventForStatusTable}/enrollment-status-by-department`;

      console.log(`Fetching departmental status from: /api/${url}`); // Added a log for easy debugging

      const response = await api.get(url);

      if (response.data.success) {
        setEventStatusByDeptData(response.data.data);
        // This checks if the backend sent a specific message (e.g., "No students found")
        if(response.data.data.message && (!response.data.data.departmentalStatus || response.data.data.departmentalStatus.length === 0)){ 
            setTimedMessage('info', response.data.data.message);
        }
      } else {
        // This handles cases where the backend responds with { success: false, error: "..." }
        setTimedMessage('error', response.data.error || 'Failed to load event enrollment status.');
      }
    } catch (err) {
      // This handles network errors or backend responses with non-2xx status codes
      setTimedMessage('error', `Error fetching status: ${err.error || err.message || 'A server error occurred.'}`);
      console.error("Fetch event status by department error:", err);
    } finally {
      setLoadingStates(prev => ({ ...prev, fetchingEventEnrollmentStatus: false }));
    } };
  const handleLogFilterChange = (e) => { setLogFilters(prev => ({ ...prev, [e.target.name]: e.target.value })); };
  const handleApplyLogFilters = () => { if (logPagination.currentPage !== 1) { setLogPagination(prev => ({ ...prev, currentPage: 1 })); } else { fetchActivityLogs(1); }};
  const handleLogPageChange = (newPage) => { if (newPage > 0 && newPage <= logPagination.totalPages) { setLogPagination(prev => ({ ...prev, currentPage: newPage })); }};
  const handleDownloadLogs = async () => { setLoadingStates(prev => ({ ...prev, isDownloadingLogs: true }));
    try {
        const params = new URLSearchParams();
        if (logFilters.username) params.append('username', logFilters.username);
        if (logFilters.action) params.append('action', logFilters.action);
        const endpoint = `events/activity-logs/download?${params.toString()}`;
        const response = await api.get(endpoint, { responseType: 'blob' });
        const blob = response.data;
        if (!(blob instanceof Blob)) throw new Error("Response was not a file.");
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const contentDisposition = response.headers['content-disposition'];
        let fileName = 'activity_logs.csv';
        if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
            if (fileNameMatch && fileNameMatch.length > 1) fileName = fileNameMatch[1];
        }
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        setTimedMessage('success', 'Activity log download started.');
    } catch (err) {
        setTimedMessage('error', err.error || 'Could not download activity logs.');
    } finally {
        setLoadingStates(prev => ({ ...prev, isDownloadingLogs: false }));
    } };

  if (loadingStates.initialData) {
    return <div className="p-6 text-center text-lg">Loading Dashboard Data...</div>;
  }

  return (
    <div className="space-y-8">
      {uiMessages.error && <p className="p-3 my-4 bg-red-100 text-red-700 rounded-md">{uiMessages.error}</p>}
      {uiMessages.success && <p className="p-3 my-4 bg-green-100 text-green-700 rounded-md">{uiMessages.success}</p>}
      {uiMessages.info && <p className="p-3 my-4 bg-blue-100 text-blue-700 rounded-md">{uiMessages.info}</p>}

      {/* Event Enrollment Status by Department Table */}
      <section className="p-6 bg-white rounded-xl shadow-lg">
  <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Event Enrollment Status by Department</h2>
  <div className="sm:flex sm:space-x-4 mb-4 items-end">
    <div className="flex-1 mb-4 sm:mb-0">
      <label htmlFor="eventStatusTableSelect" className="block text-sm font-medium text-gray-700 mb-1">Select Event:</label>
      <select 
        id="eventStatusTableSelect"
        value={selectedEventForStatusTable} 
        onChange={(e) => setSelectedEventForStatusTable(e.target.value)}
        className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">-- Select Event --</option>
        {events.map(event => <option key={event._id} value={event._id}>{event.name}</option>)}
      </select>
    </div>
    <button 
      onClick={handleFetchEventStatusByDept}
      disabled={!selectedEventForStatusTable || loadingStates.fetchingEventEnrollmentStatus}
      className="w-full sm:w-auto p-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition disabled:opacity-50 whitespace-nowrap"
    >
      {loadingStates.fetchingEventEnrollmentStatus ? "Loading..." : "View Event Status"}
    </button>
  </div>
  
  {loadingStates.fetchingEventEnrollmentStatus && <p className="mt-4 text-gray-600 text-center animate-pulse">Fetching status...</p>}
  
  {eventStatusByDeptData && !loadingStates.fetchingEventEnrollmentStatus && (
    <div className="mt-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-3">
        Status for: <span className="text-indigo-600">{eventStatusByDeptData.eventName}</span>
      </h3>
      
      {eventStatusByDeptData.message && (!eventStatusByDeptData.departmentalStatus || eventStatusByDeptData.departmentalStatus.length === 0) && 
          <p className="text-sm text-blue-600 mb-3 bg-blue-50 p-2 rounded">{eventStatusByDeptData.message}</p>
      }

      {eventStatusByDeptData.departmentalStatus && eventStatusByDeptData.departmentalStatus.length > 0 ? (
        <div className="overflow-x-auto shadow border-b border-gray-200 sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Department</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Total Students</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Enrolled</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Not Enrolled</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">% Enrolled</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {eventStatusByDeptData.departmentalStatus.map((deptStats) => (
                <tr key={deptStats.department} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{deptStats.department}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">{deptStats.total_students}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 font-medium text-center">{deptStats.signed_in_students}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-700 font-medium text-center">{deptStats.not_signed_in_students}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">{deptStats.percentage_signed_in}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loadingStates.fetchingEventEnrollmentStatus && !eventStatusByDeptData.message ? (
        <p className="text-gray-500 mt-4">No departmental enrollment data to display for this event.</p>
      ) : null}
    </div>
  )}
</section>

      {/* Download Reports Section */}
      <section className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Download Reports</h2>
        <div className="p-4 border-2 border-indigo-200 rounded-lg bg-indigo-50">
            <h3 className="text-xl font-semibold mb-3 text-indigo-700">Custom Detailed Enrollment Report</h3>
            <div className="mb-4">
                <label htmlFor="customReportScopeType" className="block text-sm font-medium text-gray-700 mb-1">Filter Report By:</label>
                <select id="customReportScopeType" value={selectedScopeType}
                    onChange={(e) => {
                        setSelectedScopeType(e.target.value);
                        setSelectedDepartmentForDownload('all'); 
                        setSelectedEventForReport(''); 
                        setSelectedCourseForReport('');
                    }}
                    className="w-full sm:w-auto p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="department">Department</option>
                    <option value="event">Event</option>
                    <option value="course">Specific Course (within Event)</option>
                </select>
            </div>

            {selectedScopeType === 'department' && (
                <div className="mb-4">
                    <label htmlFor="customReportDepartment" className="block text-sm font-medium text-gray-700 mb-1">Department:</label>
                    <select id="customReportDepartment" value={selectedDepartmentForDownload}
                        onChange={(e) => setSelectedDepartmentForDownload(e.target.value)}
                        className="w-full sm:w-auto p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        {distinctDepartments.map(dept => (
                            <option key={dept} value={dept}>{dept === 'all' ? 'All Departments' : (dept === 'N/A' ? 'N/A (No Dept.)' : dept)}</option>
                        ))}
                    </select>
                </div>
            )}

            {(selectedScopeType === 'event' || selectedScopeType === 'course') && (
                <div className="mb-4">
                    <label htmlFor="customReportEvent" className="block text-sm font-medium text-gray-700 mb-1">Event:</label>
                    <select id="customReportEvent" value={selectedEventForReport}
                        onChange={(e) => setSelectedEventForReport(e.target.value)}
                        className="w-full sm:w-auto p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required={selectedScopeType === 'event' || selectedScopeType === 'course'}>
                        <option value="">-- Select Event --</option>
                        {events.map(event => (<option key={event._id} value={event._id}>{event.name}</option>))}
                    </select>
                </div>
            )}

            {selectedScopeType === 'course' && selectedEventForReport && (
                <div className="mb-4">
                    <label htmlFor="customReportCourse" className="block text-sm font-medium text-gray-700 mb-1">Course:</label>
                    <select id="customReportCourse" value={selectedCourseForReport}
                        onChange={(e) => setSelectedCourseForReport(e.target.value)}
                        disabled={!selectedEventForReport || coursesInSelectedEvent.length === 0}
                        className="w-full sm:w-auto p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required={selectedScopeType === 'course'}>
                        <option value="">-- Select Course --</option>
                        {coursesInSelectedEvent.map(course => (<option key={course._id} value={course._id}>{course.title}</option>))}
                    </select>
                    {selectedEventForReport && coursesInSelectedEvent.length === 0 && <p className="text-xs text-gray-500 mt-1">No courses found in the selected event.</p>}
                </div>
            )}

            <div className="mb-4">
                <h4 className="text-md font-medium mb-2 text-gray-700">Select Columns to Include:</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
                    {Object.entries(availableReportColumns).map(([colKey, colConfig]) => (
                        <label key={colKey} className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
                            <input type="checkbox" checked={selectedColumns[colKey]} onChange={() => handleColumnToggle(colKey)}
                                className="form-checkbox h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-400"/>
                            <span>{colConfig.label}</span>
                        </label>
                    ))}
                </div>
            </div>
            
            <button onClick={handleDownloadCustomDetailedReport} 
                className="w-full p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                disabled={loadingStates.downloadingCustomDetailedReport || 
                          (selectedScopeType === 'department' && !selectedDepartmentForDownload) ||
                          (selectedScopeType === 'event' && !selectedEventForReport) ||
                          (selectedScopeType === 'course' && (!selectedEventForReport || !selectedCourseForReport))
                         }>
                {loadingStates.downloadingCustomDetailedReport ? 'Generating Custom Report...' : 'Download Custom Detailed Report'}
            </button>
        </div>
      </section>

      {/* Activity Logs Section */}
      <section className="p-6 bg-white rounded-xl shadow-lg">
  <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">User Activity Logs</h2>
  
  <div className="p-4 mb-4 bg-gray-50 rounded-lg border flex flex-col sm:flex-row gap-4 items-center flex-wrap">
      <div className="flex-grow w-full sm:w-auto">
          <label htmlFor="logFilterUsername" className="text-sm font-medium text-gray-700">Filter by Username</label>
          <input
              id="logFilterUsername" type="text" name="username" value={logFilters.username}
              onChange={handleLogFilterChange} placeholder=""
              className="mt-1 w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
      </div>
      <div className="flex-grow w-full sm:w-auto">
          <label htmlFor="logFilterAction" className="text-sm font-medium text-gray-700">Filter by Action</label>
          <select
              id="logFilterAction" name="action" value={logFilters.action} onChange={handleLogFilterChange}
              className="mt-1 w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
              <option value="">All Actions</option>
              <option value="LOGIN_SUCCESS">Login Success</option>
              <option value="ENROLL_SUCCESS">Enroll Success</option>
              <option value="ENROLL_FAIL">Enroll Fail</option>
          </select>
      </div>
      <div className="flex-shrink-0 pt-6 flex space-x-2">
           <button onClick={handleApplyLogFilters} className="p-2 h-10 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50" disabled={loadingStates.isFetchingLogs}>
              {loadingStates.isFetchingLogs ? 'Searching...' : 'Search'}
          </button>
          <button onClick={handleDownloadLogs} className="p-2 h-10 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50" disabled={loadingStates.isDownloadingLogs}>
              {loadingStates.isDownloadingLogs ? '...' : 'Download CSV'}
          </button>
      </div>
  </div>

  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {loadingStates.isFetchingLogs ? (
            <tr><td colSpan="4" className="text-center p-4 animate-pulse">Loading logs...</td></tr>
        ) : activityLogs.length === 0 ? (
            <tr><td colSpan="4" className="text-center p-4 text-gray-500">No logs found for the current filter.</td></tr>
        ) : (
          activityLogs.map(log => (
            <tr key={log._id} className="hover:bg-gray-50">
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
              <td className="px-4 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      log.action.includes('SUCCESS') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                      {log.action}
                  </span>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div>{log.user?.name || log.username}</div>
                  <div className="text-xs text-gray-500">{log.user?.department || 'N/A'}</div>
              </td>
              {/* ======================= THE FIX IS HERE ======================= */}
              <td className="px-4 py-4 whitespace-normal text-sm text-gray-500">
                {/* Always check if log.details exists before trying to access its properties */}
                {log.details && (
                  <>
                    {log.details.ip && <div>IP: {log.details.ip}</div>}
                    {log.details.eventName && <div>Event: {log.details.eventName}</div>}
                    {log.details.courseTitle && <div>Course: {log.details.courseTitle}</div>}
                    {log.details.errorMessage && <div className="text-red-600">Error: {log.details.errorMessage}</div>}
                  </>
                )}
              </td>
              {/* ===================== END OF THE FIX ====================== */}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
  
  <div className="mt-4 flex items-center justify-between">
      <p className="text-sm text-gray-700">
          Page {logPagination.currentPage} of {logPagination.totalPages} ({logPagination.totalLogs} total logs)
      </p>
      <div className="space-x-2">
          <button 
              onClick={() => handleLogPageChange(logPagination.currentPage - 1)}
              disabled={logPagination.currentPage <= 1 || loadingStates.isFetchingLogs}
              className="p-2 border rounded-md text-sm disabled:opacity-50"
          >
              Previous
          </button>
          <button 
              onClick={() => handleLogPageChange(logPagination.currentPage + 1)}
              disabled={logPagination.currentPage >= logPagination.totalPages || loadingStates.isFetchingLogs}
              className="p-2 border rounded-md text-sm disabled:opacity-50"
          >
              Next
          </button>
      </div>
  </div>
</section>
    </div>
  );
}

export default AdminView;