import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';

// --- Reusable Modal Component for Editing a Student (Fully Implemented) ---
const EditStudentModal = ({ isOpen, onClose, student, events, onSave, onPasswordReset, onEnroll, onUnenroll }) => {
    const [formData, setFormData] = useState({});
    const [newPassword, setNewPassword] = useState('');
    const [enrollmentSelection, setEnrollmentSelection] = useState({ eventId: '', courseId: '' });
    const [availableCourses, setAvailableCourses] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (student) {
            setFormData({
                name: student.name || '',
                username: student.username || '',
                department: student.department || '',
            });
        }
    }, [student]);
    
    useEffect(() => {
        if (enrollmentSelection.eventId) {
            const selectedEvent = events.find(e => e._id === enrollmentSelection.eventId);
            setAvailableCourses(selectedEvent?.courses || []);
        } else {
            setAvailableCourses([]);
        }
        setEnrollmentSelection(p => ({ ...p, courseId: '' }));
    }, [enrollmentSelection.eventId, events]);

    const handleChange = (e) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));
    
    const handleSave = async () => {
        setIsSaving(true);
        await onSave(student._id, formData);
        setIsSaving(false);
    };

    const handleReset = async () => {
        if (!newPassword || newPassword.length < 6) {
            alert('New password must be at least 6 characters long.');
            return;
        }
        await onPasswordReset(student._id, newPassword);
        setNewPassword('');
    };
    
    const handleEnroll = async () => {
        if (!enrollmentSelection.eventId || !enrollmentSelection.courseId) {
            alert('Please select both an event and a course to enroll.');
            return;
        }
        await onEnroll(student._id, enrollmentSelection.eventId, enrollmentSelection.courseId);
    };

    if (!isOpen || !student) return null;

    const studentEnrollmentIds = new Set(student.enrollments.map(e => e.courseId));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Edit Student: {student.name}</h3>
                <div className="space-y-4">
                    <div><label className="block text-sm font-medium">Name</label><input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded-md" /></div>
                    <div><label className="block text-sm font-medium">Username</label><input type="text" name="username" value={formData.username} onChange={handleChange} className="w-full p-2 border rounded-md" /></div>
                    <div><label className="block text-sm font-medium">Department</label><input type="text" name="department" value={formData.department} onChange={handleChange} className="w-full p-2 border rounded-md" /></div>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md">{isSaving ? 'Saving...' : 'Save Details'}</button>
                </div>
                <div className="mt-6 pt-4 border-t">
                    <h4 className="text-lg font-semibold mb-2">Reset Password</h4>
                    <div className="flex space-x-2"><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New Password (min. 6 chars)" className="flex-grow p-2 border rounded-md" /><button onClick={handleReset} className="px-4 py-2 bg-orange-500 text-white rounded-md">Reset</button></div>
                </div>
                <div className="mt-6 pt-4 border-t">
                    <h4 className="text-lg font-semibold mb-2">Manage Enrollments</h4>
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                        <h5 className="font-semibold mb-2">Enroll in New Course</h5>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                            <select value={enrollmentSelection.eventId} onChange={e => setEnrollmentSelection({ eventId: e.target.value, courseId: '' })} className="p-2 border rounded-md">
                                <option value="">-- Select Event --</option>
                                {events.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
                            </select>
                            <select value={enrollmentSelection.courseId} onChange={e => setEnrollmentSelection(p => ({ ...p, courseId: e.target.value }))} disabled={!enrollmentSelection.eventId} className="p-2 border rounded-md">
                                <option value="">-- Select Course --</option>
                                {availableCourses.map(c => !studentEnrollmentIds.has(c.course._id) && <option key={c._id} value={c._id}>{c.course.title}</option>)}
                            </select>
                            <button onClick={handleEnroll} className="px-4 py-2 bg-green-600 text-white rounded-md">Enroll Student</button>
                        </div>
                    </div>
                    <div>
                        <h5 className="font-semibold mb-2">Current Enrollments</h5>
                        {student.enrollments && student.enrollments.length > 0 ? (
                            <ul className="space-y-1">{student.enrollments.map(enr => <li key={enr._id} className="flex justify-between items-center p-2 bg-white rounded border"><span>{enr.courseTitle}</span><button onClick={() => onUnenroll(student._id, enr.eventId, enr.courseId)} className="text-xs text-red-600 font-semibold">Un-enroll</button></li>)}</ul>
                        ) : <p className="text-sm text-gray-500">No enrollments found.</p>}
                    </div>
                </div>
                <div className="flex justify-end mt-6 pt-4 border-t"><button onClick={onClose} className="px-6 py-2 bg-gray-200 rounded-md">Close</button></div>
            </div>
        </div>
    );
};

const initialNewStudentState = { username: '', name: '', password: '', department: '' };

function StudentManagementPage() {
  const [students, setStudents] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [newStudent, setNewStudent] = useState(initialNewStudentState);
  const [csvFile, setCsvFile] = useState(null);
  const [uiMessages, setUiMessages] = useState({ error: '', success: '' });
  const [loadingStates, setLoadingStates] = useState({ fetching: true, addingStudent: false, deletingStudent: null, uploadingCsv: false });
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [distinctDepartments, setDistinctDepartments] = useState(['all']);

  const setTimedMessage = (type, message, duration = 5000) => {
    setUiMessages({ [type]: message });
    setTimeout(() => setUiMessages(prev => ({ ...prev, [type]: '' })), duration);
  };

  const fetchData = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, fetching: true }));
    try {
        const [studentsRes, eventsRes, deptsRes] = await Promise.all([
            api.get('users/students'),
            api.get('events/all'),
            api.get('users/departments')
        ]);
        if (studentsRes.data.success) setStudents(studentsRes.data.data || []);
        else setTimedMessage('error', studentsRes.data.error || 'Failed to load students.');
        if (eventsRes.data.success) setEvents(eventsRes.data.data || []);
        else setTimedMessage('error', eventsRes.data.error || 'Failed to load events.');
        if (deptsRes.data.success) {
            setDistinctDepartments(['all', ...(deptsRes.data.data || [])]);
        }
    } catch(err) {
        setTimedMessage('error', err.error || 'Could not fetch initial data.');
    } finally {
        setLoadingStates(prev => ({ ...prev, fetching: false }));
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  
  const filteredStudents = useMemo(() => {
    if (filterDepartment === 'all') return students;
    const deptToFilter = filterDepartment === 'N/A' ? null : filterDepartment;
    return students.filter(s => (s.department || null) === deptToFilter);
  }, [filterDepartment, students]);

  const handleSelectStudent = (studentId) => {
    setSelectedStudents(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(studentId)) newSelected.delete(studentId);
      else newSelected.add(studentId);
      return newSelected;
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedStudents(new Set(filteredStudents.map(s => s._id)));
    else setSelectedStudents(new Set());
  };
  
  const handleBulkDelete = async () => {
    const studentIdsToDelete = Array.from(selectedStudents);
    if (studentIdsToDelete.length === 0) { setTimedMessage('error', 'No students selected to delete.'); return; }
    if (!window.confirm(`Are you sure you want to delete ${studentIdsToDelete.length} selected student(s)? This action is irreversible.`)) return;
    setLoadingStates(prev => ({ ...prev, deletingStudent: true }));
    try {
        const response = await api.delete('users', { data: { userIds: studentIdsToDelete } });
        if (response.data.success) {
            setTimedMessage('success', response.data.message);
            setSelectedStudents(new Set());
            fetchData();
        } else { setTimedMessage('error', response.data.error); }
    } catch (err) { setTimedMessage('error', err.error || 'An error occurred during bulk deletion.');
    } finally { setLoadingStates(prev => ({ ...prev, deletingStudent: null })); }
  };

  const handleNewStudentChange = (e) => setNewStudent(p => ({ ...p, [e.target.name]: e.target.value }));
  
  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudent.username.trim() || !newStudent.name.trim() || !newStudent.password) { setTimedMessage('error', 'Username, name, and password are required.'); return; }
    setLoadingStates(prev => ({ ...prev, addingStudent: true }));
    try {
      const response = await api.post('users/add-student', newStudent);
      if (response.data.success) {
        setNewStudent(initialNewStudentState);
        fetchData();
        setTimedMessage('success', `Student "${response.data.data.username}" added successfully.`);
      } else { setTimedMessage('error', `Failed to add student: ${response.data.error}`); }
    } catch (err) { setTimedMessage('error', `Failed to add student: ${err.error || err.message}`);
    } finally { setLoadingStates(prev => ({ ...prev, addingStudent: false })); }
  };

  const handleUploadCSV = async (e) => {
    e.preventDefault();
    if (!csvFile) { setTimedMessage('error', 'Please select a CSV file to upload.'); return; }
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
        fetchData();
      } else { setTimedMessage('error', `CSV upload failed: ${response.data.error}`); }
    } catch (err) {
      setTimedMessage('error', err.error || 'An unexpected error occurred during CSV upload.');
      if (err.details?.errors) console.error("CSV Upload row errors:", err.details.errors);
    } finally { setLoadingStates(prev => ({ ...prev, uploadingCsv: false })); }
  };
  
  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to delete "${studentName}"?`)) return;
    setLoadingStates(prev => ({ ...prev, deletingStudent: studentId }));
    try {
        const response = await api.delete(`users/${studentId}`);
        if (response.data.success) {
            setTimedMessage('success', response.data.message);
            fetchData();
        } else { setTimedMessage('error', response.data.error); }
    } catch (err) { setTimedMessage('error', err.error); }
    finally { setLoadingStates(prev => ({ ...prev, deletingStudent: null })); }
  };
  
  const handleSaveStudent = async (studentId, formData) => {
      try {
          const res = await api.put(`users/${studentId}`, formData);
          setTimedMessage('success', res.data.message);
          fetchData();
          setSelectedStudent(p => ({...p, ...res.data.data}));
      } catch (err) { setTimedMessage('error', err.error); }
  };
  const handlePasswordReset = async (studentId, newPassword) => {
      try {
          const res = await api.post(`users/${studentId}/reset-password`, { newPassword });
          setTimedMessage('success', res.data.message);
      } catch (err) { setTimedMessage('error', err.error); }
  };
  const handleAdminEnroll = async (userId, eventId, courseId) => {
      try {
          const res = await api.post('events/admin/enroll', { userId, eventId, courseId });
          setTimedMessage('success', res.data.message);
          const updatedStudentRes = await api.get(`users/students/${userId}`);
          setSelectedStudent(updatedStudentRes.data.data);
          fetchData();
      } catch(err) { setTimedMessage('error', err.error); }
  };
  const handleAdminUnenroll = async (userId, eventId, courseId) => {
      if (!window.confirm("Are you sure you want to un-enroll this student from the course?")) return;
      try {
          const res = await api.post('events/admin/unenroll', { userId, eventId, courseId });
          setTimedMessage('success', res.data.message);
          const updatedStudentRes = await api.get(`users/students/${userId}`);
          setSelectedStudent(updatedStudentRes.data.data);
          fetchData();
      } catch(err) { setTimedMessage('error', err.error); }
  };

  return (
    <div className="space-y-8 p-4 md:p-6">
      <h1 className="text-4xl font-bold text-gray-800">Student Management</h1>
      <p className="text-lg text-gray-600">Add, upload, view, edit, and manage student accounts.</p>
      
      {uiMessages.error && <p className="p-3 my-4 bg-red-100 text-red-700 rounded-md">{uiMessages.error}</p>}
      {uiMessages.success && <p className="p-3 my-4 bg-green-100 text-green-700 rounded-md">{uiMessages.success}</p>}
      
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
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
            <h2 className="text-2xl font-semibold">Student List</h2>
            <div>
                <label htmlFor="deptFilter" className="text-sm font-medium mr-2">Filter by Department:</label>
                <select id="deptFilter" value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)} className="p-2 border rounded-md">
                    {distinctDepartments.map(dept => <option key={dept} value={dept}>{dept === 'all' ? 'All Departments' : dept || 'N/A'}</option>)}
                </select>
            </div>
            {selectedStudents.size > 0 && ( <button onClick={handleBulkDelete} disabled={!!loadingStates.deletingStudent} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"> {loadingStates.deletingStudent ? 'Deleting...' : `Delete Selected (${selectedStudents.size})`} </button> )}
        </div>
        <div className="overflow-x-auto">
            {loadingStates.fetching ? <p className="text-center p-4">Loading...</p> : (
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="p-4"><input type="checkbox" onChange={handleSelectAll} checked={filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length} ref={el => el && (el.indeterminate = selectedStudents.size > 0 && selectedStudents.size < filteredStudents.length)}/></th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase">Username</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase">Department</th>
                            <th className="px-6 py-3 text-right text-xs font-medium uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y">
                        {filteredStudents.map((student) => (
                            <tr key={student._id} className={selectedStudents.has(student._id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}>
                                <td className="p-4"><input type="checkbox" checked={selectedStudents.has(student._id)} onChange={() => handleSelectStudent(student._id)}/></td>
                                <td className="px-6 py-4 whitespace-nowrap">{student.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{student.username}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{student.department || 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                                    <button onClick={() => setSelectedStudent(student)} className="text-indigo-600 hover:underline font-semibold">Edit</button>
                                    <button onClick={() => handleDeleteStudent(student._id, student.name)} disabled={!!loadingStates.deletingStudent} className="text-red-600 hover:underline font-semibold disabled:text-gray-400">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
      </section>

      <EditStudentModal 
        isOpen={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        student={selectedStudent}
        events={events}
        onSave={handleSaveStudent}
        onPasswordReset={handlePasswordReset}
        onEnroll={handleAdminEnroll}
        onUnenroll={handleAdminUnenroll}
      />
    </div>
  );
}
export default StudentManagementPage;