// src/pages/EventManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// Reusable Modal Component for editing an event
const EditEventModal = ({ isOpen, onClose, event, onSave }) => {
    const [name, setName] = useState('');
    const [isOpenForEnrollment, setIsOpenForEnrollment] = useState(false);
    const [maxCourses, setMaxCourses] = useState(1);
    const [error, setError] = useState('');

    useEffect(() => {
        if (event) {
            setName(event.name);
            setIsOpenForEnrollment(event.isOpen);
            setMaxCourses(event.maxCoursesPerStudent || 1);
            setError('');
        }
    }, [event]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!name.trim()) {
            setError('Event name cannot be empty.');
            return;
        }
        const maxCoursesNum = parseInt(maxCourses, 10);
        if (isNaN(maxCoursesNum) || maxCoursesNum < 1) {
            setError('Max courses must be a number and at least 1.');
            return;
        }
        onSave(event._id, { 
            name: name.trim(), 
            isOpen: isOpenForEnrollment, 
            maxCoursesPerStudent: maxCoursesNum 
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-semibold mb-4 text-gray-800">Edit Event</h3>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="editEventName" className="block text-sm font-medium text-gray-700">Event Name</label>
                        <input id="editEventName" type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" />
                    </div>
                    <div>
                        <label htmlFor="editMaxCourses" className="block text-sm font-medium text-gray-700">Max Courses Per Student</label>
                        <input id="editMaxCourses" type="number" min="1" value={maxCourses} onChange={(e) => setMaxCourses(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" />
                    </div>
                    <div className="flex items-center">
                        <input id="editIsEventOpen" type="checkbox" checked={isOpenForEnrollment} onChange={(e) => setIsOpenForEnrollment(e.target.checked)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                        <label htmlFor="editIsEventOpen" className="ml-2 block text-sm text-gray-900">Open for Enrollment</label>
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <div className="mt-6 flex justify-end space-x-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">Save</button>
                </div>
            </div>
        </div>
    );
};

function EventManagementPage() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uiMessage, setUiMessage] = useState({ type: '', text: '' });
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [newEventName, setNewEventName] = useState('');
    const [newMaxCourses, setNewMaxCourses] = useState(1);
    const [isCreating, setIsCreating] = useState(false);
    const navigate = useNavigate();

    const setTimedMessage = (type, text, duration = 5000) => {
        setUiMessage({ type, text });
        setTimeout(() => setUiMessage({ type: '', text: '' }), duration);
    };

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('events/all');
            if (response.data.success) {
                setEvents(response.data.data || []);
            } else { setTimedMessage('error', response.data.error || 'Failed to load events.'); }
        } catch (err) { setTimedMessage('error', err.error || 'Could not fetch events.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);
    
    const handleCreateEvent = async (e) => {
        e.preventDefault();
        const maxCoursesNum = parseInt(newMaxCourses, 10);
        if (!newEventName.trim()) { setTimedMessage('error', 'Event name is required.'); return; }
        if (isNaN(maxCoursesNum) || maxCoursesNum < 1) { setTimedMessage('error', 'Max courses must be a number >= 1.'); return; }
        
        setIsCreating(true);
        try {
            const response = await api.post('events', { 
                name: newEventName.trim(), 
                maxCoursesPerStudent: maxCoursesNum 
            });
            if (response.data.success) {
                setTimedMessage('success', `Event created successfully.`);
                setNewEventName('');
                setNewMaxCourses(1);
                fetchEvents();
            } else { setTimedMessage('error', response.data.error); }
        } catch (err) { setTimedMessage('error', err.error); }
        finally { setIsCreating(false); }
    };
    
    const handleUpdateEvent = async (eventId, updatedData) => {
        try {
            const response = await api.put(`events/${eventId}`, updatedData);
            if (response.data.success) {
                setTimedMessage('success', 'Event updated successfully!');
                setSelectedEvent(null);
                fetchEvents();
            } else { setTimedMessage('error', response.data.error); }
        } catch (err) { setTimedMessage('error', err.error); }
    };
    
    const handleDeleteEvent = async (eventId, eventName) => {
        if (!window.confirm(`DELETE the event "${eventName}"? This cannot be undone.`)) return;
        try {
            const response = await api.delete(`events/${eventId}`);
            if (response.data.success) {
                setTimedMessage('success', response.data.message);
                fetchEvents();
            } else { setTimedMessage('error', response.data.error); }
        } catch (err) { setTimedMessage('error', err.error); }
    };

    return (
        <div className="space-y-8">
            <h1 className="text-4xl font-bold text-gray-800">Event Management</h1>
            <p className="text-lg text-gray-600">Create, edit, and manage all enrollment events.</p>
            
            {uiMessage.error && <p className="p-3 my-4 bg-red-100 text-red-700 rounded-md shadow-sm">{uiMessage.error}</p>}
            {uiMessage.success && <p className="p-3 my-4 bg-green-100 text-green-700 rounded-md shadow-sm">{uiMessage.success}</p>}
            
            <section className="p-6 bg-white rounded-xl shadow-lg">
                <h2 className="text-2xl font-semibold mb-4 text-gray-700 border-b pb-2">Create New Event</h2>
                <form onSubmit={handleCreateEvent} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div className="sm:col-span-2">
                        <label htmlFor="newEventName" className="block text-sm font-medium text-gray-700 mb-1">New Event Name</label>
                        <input id="newEventName" type="text" value={newEventName} onChange={(e) => setNewEventName(e.target.value)} required placeholder="e.g., Spring 2025 Registration" className="w-full p-2 border border-gray-300 rounded-md"/>
                    </div>
                    <div>
                        <label htmlFor="newMaxCourses" className="block text-sm font-medium text-gray-700 mb-1">Max Courses/Student</label>
                        <input id="newMaxCourses" type="number" min="1" value={newMaxCourses} onChange={(e) => setNewMaxCourses(e.target.value)} required className="w-full p-2 border border-gray-300 rounded-md"/>
                    </div>
                    <button type="submit" disabled={isCreating} className="sm:col-span-3 w-full p-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
                        {isCreating ? 'Creating...' : 'Create Event'}
                    </button>
                </form>
            </section>
            
            <section className="p-6 bg-white rounded-xl shadow-lg">
                <h2 className="text-2xl font-semibold mb-4">Existing Events</h2>
                <div className="overflow-x-auto">
                    {loading ? <p className="p-4 text-center animate-pulse">Loading events...</p> : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Max Courses</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"># of Courses</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {events.map((event) => (
                                    <tr key={event._id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{event.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${event.isOpen ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{event.isOpen ? 'Open' : 'Closed'}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-gray-700">{event.maxCoursesPerStudent}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">{(event.courses || []).length}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                                            <button onClick={() => navigate(`/admin/events/${event._id}`)} className="text-green-600 hover:text-green-900 font-semibold">Manage Courses</button>
                                            <button onClick={() => setSelectedEvent(event)} className="text-indigo-600 hover:text-indigo-900 font-semibold">Edit</button>
                                            <button onClick={() => handleDeleteEvent(event._id, event.name)} className="text-red-600 hover:text-red-900 font-semibold">Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
            
            <EditEventModal isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} event={selectedEvent} onSave={handleUpdateEvent} />
        </div>
    );
}
export default EventManagementPage;