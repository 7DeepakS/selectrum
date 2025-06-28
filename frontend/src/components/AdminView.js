import React, { useState, useEffect, useCallback, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';

const initialNewCourseState = {
  title: '',
  description: '',
  slots: [{ id: 1, time: new Date().toISOString().slice(0, 16), maxCapacity: 10, isActive: true }],
};

const initialNewStudentState = { username: '', name: '', password: '', department: '' };

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
  const { user: authUser } = useContext(AuthContext);
  const [events, setEvents] = useState([]);
  const [newEventName, setNewEventName] = useState('');
  const [newCourse, setNewCourse] = useState({...initialNewCourseState, slots: [{...initialNewCourseState.slots[0], id: 1}]});
  const [newStudent, setNewStudent] = useState({...initialNewStudentState});
  
  const [uiMessages, setUiMessages] = useState({ error: '', success: '', info: '' });
  const [loadingStates, setLoadingStates] = useState({
    initialData: true,
    creatingEvent: false,
    addingCourse: false,
    togglingEvent: null,
    addingStudent: false,
    uploadingCsv: false,
    downloadingCustomDetailedReport: false, 
    fetchingEventEnrollmentStatus: false,
    isFetchingLogs: false,
    isDownloadingLogs: false,
  });

  const [selectedEventIdForCourse, setSelectedEventIdForCourse] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [distinctDepartments, setDistinctDepartments] = useState(['all']); 

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
  
  const [selectedEventForStatusTable, setSelectedEventForStatusTable] = useState(''); 
  const [eventStatusByDeptData, setEventStatusByDeptData] = useState(null); 

  const [activityLogs, setActivityLogs] = useState([]);
  const [logFilters, setLogFilters] = useState({ username: '', action: '' });
  const [logPagination, setLogPagination] = useState({ currentPage: 1, totalPages: 1, totalLogs: 0 });

  const setTimedMessage = (type, message, duration = 7000) => {
    setUiMessages({ error: '', success: '', info: '', [type]: message });
    setTimeout(() => setUiMessages(prev => ({ ...prev, [type]: '' })), duration);
  };

  const fetchAdminData = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, initialData: true }));
    try {
        const eventsPromise = api.get('events');
        const deptsPromise = api.get('events/enrollment-summary/by-department');
        const [eventsResponse, deptsResponse] = await Promise.all([
            eventsPromise,
            deptsPromise.catch(err => { console.warn("Failed to fetch distinct departments for dropdown.", err.message); return null; })
        ]);

        if (eventsResponse.data.success) { setEvents(eventsResponse.data.data || []); }
        else { setTimedMessage('error', eventsResponse.data.error || 'Failed to load events.'); }

        if (deptsResponse?.data?.success) {
            let depts = ['all', ...(deptsResponse.data.data.distinctDepartments || [])];
            depts = [...new Set(depts)];
            depts.sort((a,b) => {
                if (a === 'all') return -1; if(b==='all') return 1; if(a==='N/A') return 1; if(b==='N/A') return -1;
                return String(a).localeCompare(b);
            });
            setDistinctDepartments(depts);
        } else { setDistinctDepartments(['all', 'N/A']); }
    } catch (err) {
        setTimedMessage('error', `Failed to load admin data: ${err.response?.data?.error || err.message}`);
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
            const { logs, ...pagination } = response.data.data;
            setActivityLogs(logs);
            setLogPagination(pagination);
        } else {
            setTimedMessage('error', response.data.error || 'Failed to fetch activity logs.');
        }
    } catch (err) {
        setTimedMessage('error', err.error || 'Could not fetch activity logs.');
    } finally {
        setLoadingStates(prev => ({ ...prev, isFetchingLogs: false }));
    }
  }, [logFilters]);

  useEffect(() => {
    fetchAdminData();
    fetchActivityLogs();
  }, [fetchAdminData]); // fetchActivityLogs is memoized and only depends on logFilters

  useEffect(() => {
    fetchActivityLogs(logPagination.currentPage);
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

  useEffect(() => { 
      setEventStatusByDeptData(null); 
  }, [selectedEventForStatusTable]);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEventName.trim()) { setTimedMessage('error', 'Event name cannot be empty.'); return; }
    setLoadingStates(prev => ({ ...prev, creatingEvent: true }));
    try {
      const response = await api.post('events', { name: newEventName, isOpen: false });
      if (response.data.success) {
        setNewEventName(''); fetchAdminData(); 
        setTimedMessage('success', `Event "${response.data.data.name}" created successfully!`);
      } else { setTimedMessage('error', `Failed to create event: ${response.data.error || 'Unknown error'}`); }
    } catch (err) { setTimedMessage('error', `Failed to create event: ${err.response?.data?.error || err.message}`);
    } finally { setLoadingStates(prev => ({ ...prev, creatingEvent: false })); }
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!selectedEventIdForCourse) { setTimedMessage('error', 'Please select an event.'); return; }
    if (!newCourse.title.trim()) { setTimedMessage('error', 'Course title cannot be empty.'); return; }
    if (newCourse.slots.some(slot => !slot.time || !String(slot.maxCapacity).trim() || parseInt(slot.maxCapacity, 10) < 1)) {
        setTimedMessage('error', 'All slots must have a valid time and max capacity > 0.'); return;
    }
    setLoadingStates(prev => ({ ...prev, addingCourse: true }));
    try {
      const coursePayload = {...newCourse, slots: newCourse.slots.map((slot) => ({...slot, time: new Date(slot.time).toISOString(), maxCapacity: parseInt(slot.maxCapacity, 10)}))};
      const response = await api.post(`events/${selectedEventIdForCourse}/courses`, coursePayload);
      if (response.data.success) {
        setNewCourse({...initialNewCourseState, slots: [{...initialNewCourseState.slots[0], id: 1}]});
        setSelectedEventIdForCourse(''); fetchAdminData();
        setTimedMessage('success', `Course "${response.data.data.title}" added successfully!`);
      } else { setTimedMessage('error', `Failed to add course: ${response.data.error || 'Unknown error.'}`);}
    } catch (err) { setTimedMessage('error', `Failed to add course: ${err.response?.data?.error || err.message}`);
    } finally { setLoadingStates(prev => ({ ...prev, addingCourse: false }));}
  };

  const handleToggleEvent = async (eventId, currentIsOpenStatus) => {
    setLoadingStates(prev => ({ ...prev, togglingEvent: eventId }));
    try {
      const response = await api.post(`events/toggle/${eventId}`, { isOpen: !currentIsOpenStatus });
      if (response.data.success) { fetchAdminData(); setTimedMessage('success', `Event status updated.`); }
      else { setTimedMessage('error', `Failed to toggle event: ${response.data.error || 'Unknown error.'}`);}
    } catch (err) { setTimedMessage('error', `Failed to toggle event: ${err.response?.data?.error || err.message}`);
    } finally { setLoadingStates(prev => ({ ...prev, togglingEvent: null }));}
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudent.username.trim() || !newStudent.name.trim() || !newStudent.password) {
        setTimedMessage('error', 'Username, name, and password are required.'); return;
    }
    setLoadingStates(prev => ({ ...prev, addingStudent: true }));
    try {
      const response = await api.post('events/add-student', newStudent);
      if (response.data.success) {
        setNewStudent({...initialNewStudentState}); fetchAdminData();
        setTimedMessage('success', `Student "${response.data.data.username}" added.`);
      } else { setTimedMessage('error', `Failed to add student: ${response.data.error || 'Unknown error.'}`);}
    } catch (err) { setTimedMessage('error', `Failed to add student: ${err.response?.data?.error || err.message}`);
    } finally { setLoadingStates(prev => ({ ...prev, addingStudent: false }));}
  };

  const handleUploadCSV = async (e) => {
    e.preventDefault();
    if (!csvFile) { setTimedMessage('error', 'Please select a CSV file.'); return;}
    setLoadingStates(prev => ({ ...prev, uploadingCsv: true }));
    const formData = new FormData(); formData.append('csv', csvFile);
    try {
      const response = await api.post('events/upload-students', formData, { headers: { 'Content-Type': 'multipart/form-data' }});
      if (response.data.success || response.status === 207) {
        setCsvFile(null); const fileInput = document.getElementById('csv-upload-input'); if (fileInput) fileInput.value = '';
        let message = response.data.message || 'CSV processed.';
        let messageType = 'success';
        if (response.data.errors && response.data.errors.length > 0) {
            message += ` ${response.data.errors.length} row(s) had errors. Check console.`;
            console.warn("CSV Upload partial errors/failures:", response.data.errors);
            if (response.data.createdCount === 0 && response.status !== 207) messageType = 'error';
            else if (response.data.createdCount > 0) messageType = 'success';
            else messageType = 'error';
        }
        setTimedMessage(messageType, message);
        fetchAdminData();
      } else { setTimedMessage('error', `CSV upload failed: ${response.data.error || response.data.message || 'Unknown server error.'}`);}
    } catch (err) {
      let errorMsg = 'CSV upload failed.';
      if (err.response && err.response.data) {
          errorMsg = err.response.data.error || err.response.data.message || err.message;
          if(err.response.data.details && err.response.data.details.errors) { console.error("CSV Server Errors (details):", err.response.data.details.errors);}
          else if (err.response.data.errors) { errorMsg = err.response.data.message || errorMsg; console.warn("CSV Upload Server Errors (list):", err.response.data.errors);}
      } else { errorMsg = err.message || 'An unexpected error occurred.';}
      setTimedMessage('error', errorMsg); console.error('CSV upload error object:', err.response || err);
    } finally { setLoadingStates(prev => ({ ...prev, uploadingCsv: false }));}
  };
  
  const handleColumnToggle = (columnName) => {
    setSelectedColumns(prev => ({ ...prev, [columnName]: !prev[columnName] }));
  };

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

  const handleFetchEventStatusByDept = async () => {
    if (!selectedEventForStatusTable) {
      setTimedMessage('error', 'Please select an event to view its enrollment status.');
      return;
    }
    setLoadingStates(prev => ({ ...prev, fetchingEventEnrollmentStatus: true }));
    setEventStatusByDeptData(null); 

    try {
      // NOTE: Your backend might have a different route name here
      const url = `events/${selectedEventForStatusTable}/enrollment-status-by-department`;
      const response = await api.get(url);
      if (response.data.success) {
        setEventStatusByDeptData(response.data.data);
        if(response.data.data.message && (!response.data.data.departmentalStatus || response.data.data.departmentalStatus.length === 0)){ 
            setTimedMessage('info', response.data.data.message);
        }
      } else {
        setTimedMessage('error', response.data.error || 'Failed to load event enrollment status.');
      }
    } catch (err) {
      setTimedMessage('error', `Error fetching status by department: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, fetchingEventEnrollmentStatus: false }));
    }
  };

  const handleLogFilterChange = (e) => {
    const { name, value } = e.target;
    setLogFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleApplyLogFilters = () => {
    if (logPagination.currentPage !== 1) {
        setLogPagination(prev => ({ ...prev, currentPage: 1 }));
    } else {
        fetchActivityLogs(1); // Manually trigger fetch if already on page 1
    }
  };
  
  const handleLogPageChange = (newPage) => {
    if (newPage > 0 && newPage <= logPagination.totalPages && newPage !== logPagination.currentPage) {
        setLogPagination(prev => ({ ...prev, currentPage: newPage }));
    }
  };

  const handleDownloadLogs = async () => {
    setLoadingStates(prev => ({ ...prev, isDownloadingLogs: true }));
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
    }
  };

  const handleNewEventChange = (e) => setNewEventName(e.target.value);
  const handleNewCourseChange = (e) => { const { name, value } = e.target; setNewCourse(prev => ({ ...prev, [name]: value })); };
  const handleSlotChange = (index, field, value) => {
    const updatedSlots = [...newCourse.slots]; let parsedValue = value;
    if (field === 'maxCapacity') { parsedValue = value === '' ? '' : parseInt(value, 10); if (value !== '' && (isNaN(parsedValue) || parsedValue < 0)) parsedValue = updatedSlots[index].maxCapacity; }
    else if (field === 'isActive') { parsedValue = value; }
    updatedSlots[index] = { ...updatedSlots[index], [field]: parsedValue }; setNewCourse(prev => ({ ...prev, slots: updatedSlots }));
  };
  const addSlotToCourse = () => {
    const newSlotId = newCourse.slots.length > 0 ? Math.max(0, ...newCourse.slots.map(s => s.id)) + 1 : 1;
    setNewCourse(prev => ({ ...prev, slots: [...prev.slots, { id: newSlotId, time: new Date().toISOString().slice(0,16), maxCapacity: 10, isActive: true }] }));
  };
  const removeSlotFromCourse = (index) => {
    if (newCourse.slots.length <= 1) { setTimedMessage('error', 'A course must have at least one slot.'); return; }
    setNewCourse(prev => ({ ...prev, slots: prev.slots.filter((_, i) => i !== index) }));
  };
  const handleNewStudentChange = (e) => { const { name, value } = e.target; setNewStudent(prev => ({ ...prev, [name]: value })); };

  if (loadingStates.initialData) {
    return <div className="p-6 text-center text-lg">Loading admin dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-8 bg-gray-100 min-h-screen">
      <header className="py-4"><h1 className="text-4xl font-bold text-center text-gray-800">Admin Dashboard</h1></header>
      
      {uiMessages.error && <p className="p-3 my-4 bg-red-100 border border-red-400 text-red-700 rounded-md text-center shadow" role="alert">{uiMessages.error}</p>}
      {uiMessages.success && <p className="p-3 my-4 bg-green-100 border border-green-400 text-green-700 rounded-md text-center shadow" role="status">{uiMessages.success}</p>}
      {uiMessages.info && <p className="p-3 my-4 bg-blue-100 border border-blue-400 text-blue-700 rounded-md text-center shadow" role="status">{uiMessages.info}</p>}

      {/* Create New Event Section */}
      <section className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Create New Event</h2>
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <div>
            <label htmlFor="newEventName" className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
            <input
              id="newEventName" type="text" value={newEventName} onChange={handleNewEventChange}
              placeholder=""
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required
            />
          </div>
          <button type="submit" className="w-full p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50" disabled={loadingStates.creatingEvent}>
            {loadingStates.creatingEvent ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      </section>

      {/* Add Course to Event Section */}
      <section className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Add Course to Event</h2>
        <form onSubmit={handleAddCourse} className="space-y-4">
          <div>
            <label htmlFor="selectEventForCourse" className="block text-sm font-medium text-gray-700 mb-1">Select Event</label>
            <select id="selectEventForCourse" value={selectedEventIdForCourse} onChange={(e) => setSelectedEventIdForCourse(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" required>
              <option value="">-- Select Event --</option>
              {events.map((event) => (<option key={event._id} value={event._id}>{event.name}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="courseTitle" className="block text-sm font-medium text-gray-700 mb-1">Course Title</label>
            <input id="courseTitle" type="text" name="title" value={newCourse.title} onChange={handleNewCourseChange}
              placeholder="" required
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="courseDescription" className="block text-sm font-medium text-gray-700 mb-1">Course Description</label>
            <textarea id="courseDescription" name="description" value={newCourse.description} onChange={handleNewCourseChange}
              placeholder="" rows="3"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <fieldset className="border p-4 rounded-lg bg-gray-50">
            <legend className="text-lg font-medium px-2 text-gray-700">Course Slots</legend>
            {newCourse.slots.map((slot, index) => (
              <div key={slot.id} className="space-y-2 mb-4 p-3 border rounded-md bg-white shadow-sm relative">
                <p className="font-semibold text-md text-gray-800">Slot {index + 1} (ID: {slot.id})</p>
                <div>
                  <label htmlFor={`slotTime-${slot.id}`} className="block text-xs font-medium text-gray-600">Time</label>
                  <input id={`slotTime-${slot.id}`} type="datetime-local" value={slot.time}
                    onChange={(e) => handleSlotChange(index, 'time', e.target.value)} required
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                </div>
                <div>
                  <label htmlFor={`slotMaxCapacity-${slot.id}`} className="block text-xs font-medium text-gray-600">Max Capacity</label>
                  <input id={`slotMaxCapacity-${slot.id}`} type="number" value={slot.maxCapacity}
                    onChange={(e) => handleSlotChange(index, 'maxCapacity', e.target.value)}
                    placeholder="Max Capacity" min="1" required
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                </div>
                <div className="flex items-center space-x-2 pt-1">
                  <input id={`slotIsActive-${slot.id}`} type="checkbox" checked={slot.isActive}
                    onChange={(e) => handleSlotChange(index, 'isActive', e.target.checked)}
                    className="form-checkbox h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                  <label htmlFor={`slotIsActive-${slot.id}`} className="text-sm text-gray-700">Active</label>
                </div>
                {newCourse.slots.length > 1 && (
                  <button type="button" onClick={() => removeSlotFromCourse(index)} title="Remove this slot"
                    className="absolute top-3 right-3 text-red-600 hover:text-red-800 p-1 bg-red-100 rounded-full leading-none text-lg">
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addSlotToCourse}
              className="mt-2 p-2 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition">
              + Add Another Slot
            </button>
          </fieldset>
          <button type="submit" className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            disabled={loadingStates.addingCourse || !selectedEventIdForCourse}>
            {loadingStates.addingCourse ? 'Adding Course...' : 'Add Course'}
          </button>
        </form>
      </section>
      
      <section className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Manage Events</h2>
        {events.length === 0 && <p className="text-gray-500">No events created yet.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <div key={event._id} className="p-4 border rounded-lg shadow-md bg-gray-50 hover:shadow-lg transition-shadow">
              <h3 className="font-semibold text-xl text-gray-800 mb-2">{event.name}</h3>
              <p className="text-sm text-gray-600">Courses: {(event.courses || []).length}</p>
              <p className={`text-sm font-medium mb-3 ${event.isOpen ? 'text-green-600' : 'text-red-600'}`}>
                Status: {event.isOpen ? 'Open' : 'Closed'}
              </p>
              <button onClick={() => handleToggleEvent(event._id, event.isOpen)}
                disabled={loadingStates.togglingEvent === event._id}
                className={`w-full p-2 rounded-lg text-white transition ${
                  event.isOpen ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                } disabled:opacity-50`}>
                {loadingStates.togglingEvent === event._id ? 'Updating...' : (event.isOpen ? 'Close Event' : 'Open Event')}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Add New Student</h2>
        <form onSubmit={handleAddStudent} className="space-y-4">
          <div>
            <label htmlFor="newStudentUsername" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input id="newStudentUsername" type="text" name="username" value={newStudent.username} onChange={handleNewStudentChange} placeholder="" required className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="newStudentName" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input id="newStudentName" type="text" name="name" value={newStudent.name} onChange={handleNewStudentChange} placeholder="" required className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="newStudentPassword" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input id="newStudentPassword" type="password" name="password" value={newStudent.password} onChange={handleNewStudentChange} placeholder="" required className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label htmlFor="newStudentDepartment" className="block text-sm font-medium text-gray-700 mb-1">Department (Optional)</label>
            <input id="newStudentDepartment" type="text" name="department" value={newStudent.department} onChange={handleNewStudentChange} placeholder="" className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button type="submit" className="w-full p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
            disabled={loadingStates.addingStudent}>
            {loadingStates.addingStudent ? 'Adding...' : 'Add Student'}
          </button>
        </form>
      </section>

      <section className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Upload Students via CSV</h2>
        <p className="text-sm text-gray-600 mb-2">CSV file must have headers (all lowercase): <code>username</code>, <code>name</code>, <code>password</code>. Optional: <code>department</code>.</p>
        <form onSubmit={handleUploadCSV} className="space-y-4">
          <div>
            <label htmlFor="csv-upload-input" className="block text-sm font-medium text-gray-700 mb-1">Select CSV File</label>
            <input id="csv-upload-input" type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files[0])}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-gray-300 rounded-lg cursor-pointer p-2"
              required />
          </div>
          <button type="submit" className="w-full p-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50"
            disabled={loadingStates.uploadingCsv || !csvFile}>
            {loadingStates.uploadingCsv ? 'Uploading...' : 'Upload CSV'}
          </button>
        </form>
      </section>

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
        
        {loadingStates.fetchingEventEnrollmentStatus && <p className="mt-4 text-gray-600 text-center">Fetching status...</p>}
        
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
                      <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Enrolled in Event</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Not Enrolled</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">% Enrolled</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {eventStatusByDeptData.departmentalStatus.map((deptStats) => (
                      <tr key={deptStats.department} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{deptStats.department}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{deptStats.total_students}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 font-medium">{deptStats.signed_in_students}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-700 font-medium">{deptStats.not_signed_in_students}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{deptStats.percentage_signed_in}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : !loadingStates.fetchingEventEnrollmentStatus && (!eventStatusByDeptData.message || eventStatusByDeptData.totalPotentialInFilter > 0) ? (
              <p className="text-gray-500 mt-4">No departmental enrollment data to display for this event, or no students found in the system matching criteria.</p>
            ) : null}
          </div>
        )}
      </section>

     {/* --- NEW SECTION: Activity Log Viewer --- */}
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