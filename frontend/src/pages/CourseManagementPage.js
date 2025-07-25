// src/pages/CourseManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';

const initialNewCourseState = { title: '', description: '', slots: [{ id: Date.now(), time: new Date().toISOString().slice(0, 16), maxCapacity: 10, isActive: true }] };

// Reusable Modal for Creating AND Editing a Course
const CourseModal = ({ isOpen, onClose, onSave, courseToEdit }) => {
    const [courseData, setCourseData] = useState(initialNewCourseState);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && courseToEdit) {
            const editableSlots = (courseToEdit.slots || []).map(s => ({
                ...s, time: new Date(s.time).toISOString().slice(0, 16), key: s._id || Date.now() + Math.random()
            }));
            setCourseData({ ...courseToEdit, slots: editableSlots });
        } else {
            setCourseData(initialNewCourseState);
        }
    }, [courseToEdit, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => setCourseData(p => ({ ...p, [e.target.name]: e.target.value }));
    const handleSlotChange = (index, field, value) => {
        const slots = [...courseData.slots];
        const finalValue = field === 'maxCapacity' ? parseInt(value, 10) || 0 : (field === 'isActive' ? value : value);
        slots[index] = { ...slots[index], [field]: finalValue };
        setCourseData(p => ({ ...p, slots }));
    };
    const addSlot = () => setCourseData(p => ({ ...p, slots: [...p.slots, { key: Date.now(), time: new Date().toISOString().slice(0,16), maxCapacity: 10, isActive: true }]}));
    const removeSlot = (index) => { if (courseData.slots.length > 1) setCourseData(p => ({ ...p, slots: p.slots.filter((_, i) => i !== index) })); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try { await onSave(courseData); }
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-semibold mb-4">{courseToEdit ? 'Edit Course' : 'Add New Course'}</h3>
                <div className="space-y-4">
                    <div><label className="block text-sm font-medium">Course Title</label><input name="title" value={courseData.title} onChange={handleChange} required className="w-full p-2 border rounded-md" /></div>
                    <div><label className="block text-sm font-medium">Description</label><textarea name="description" value={courseData.description} onChange={handleChange} rows="3" className="w-full p-2 border rounded-md" /></div>
                    <fieldset className="border p-4 rounded-lg"><legend>Slots</legend>
                        {courseData.slots.map((slot, index) => (
                            <div key={slot.key || index} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center mb-2 p-2 border-t relative">
                                <div><label className="text-xs">Time & Date</label><input type="datetime-local" value={slot.time} onChange={(e) => handleSlotChange(index, 'time', e.target.value)} required className="w-full p-2 border rounded-md" /></div>
                                <div><label className="text-xs">Capacity</label><input type="number" value={slot.maxCapacity} min="1" onChange={(e) => handleSlotChange(index, 'maxCapacity', e.target.value)} placeholder="Capacity" required className="w-full p-2 border rounded-md" /></div>
                                <div className="pt-5"><label className="flex items-center"><input type="checkbox" checked={slot.isActive} onChange={e => handleSlotChange(index, 'isActive', e.target.checked)} className="h-4 w-4 mr-2"/> Active</label></div>
                                {courseData.slots.length > 1 && (<button type="button" onClick={() => removeSlot(index)} className="text-red-500 font-bold hover:text-red-700">X</button>)}
                            </div>
                        ))}
                        <button type="button" onClick={addSlot} className="mt-2 p-2 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200">+ Add Slot</button>
                    </fieldset>
                </div>
                <div className="mt-6 flex justify-end space-x-4"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button><button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save Course'}</button></div>
            </form>
        </div>
    );
};

function CourseManagementPage() {
    const { eventId } = useParams();
    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uiMessage, setUiMessage] = useState({ type: '', text: '' });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [courseToEdit, setCourseToEdit] = useState(null);

    const setTimedMessage = (type, text, duration = 5000) => { setUiMessage({ type, text }); setTimeout(() => setUiMessage({ type: '', text: '' }), duration); };
    const fetchEventDetails = useCallback(async () => {
        try {
            const response = await api.get(`events/${eventId}`);
            if (response.data.success) setEvent(response.data.data);
            else setTimedMessage('error', response.data.error);
        } catch (err) { setTimedMessage('error', err.error); }
        finally { setLoading(false); }
    }, [eventId]);
    useEffect(() => { fetchEventDetails(); }, [fetchEventDetails]);

    const handleAddOrUpdateCourse = async (courseData) => {
        try {
            const response = courseToEdit 
                ? await api.put(`events/${eventId}/courses/${courseToEdit._id}`, courseData)
                : await api.post(`events/${eventId}/courses`, courseData);

            if (response.data.success) {
                setTimedMessage('success', courseToEdit ? 'Course updated!' : 'Course added!');
                setIsModalOpen(false);
                setCourseToEdit(null);
                fetchEventDetails();
            } else { setTimedMessage('error', response.data.error); }
        } catch (err) { setTimedMessage('error', err.error); }
    };
    
    const handleDeleteCourse = async (courseId, courseTitle) => {
        if (!window.confirm(`DELETE "${courseTitle}"? This cannot be undone.`)) return;
        try {
            await api.delete(`events/${eventId}/courses/${courseId}`);
            setTimedMessage('success', 'Course deleted.');
            fetchEventDetails();
        } catch(err) { setTimedMessage('error', err.error); }
    };

    const openCreateModal = () => { setCourseToEdit(null); setIsModalOpen(true); };
    const openEditModal = (course) => { setCourseToEdit(course); setIsModalOpen(true); };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (!event) return <div className="p-8 text-center">Event not found. <Link to="/admin/events" className="text-indigo-600">Back</Link></div>;

    return (
        <div className="space-y-8">
            <div>
                <Link to="/admin/events" className="text-indigo-600 hover:underline">← Back to All Events</Link>
                <h1 className="text-3xl font-bold mt-1">Manage Courses for: <span className="text-indigo-600">{event.name}</span></h1>
            </div>
            {uiMessage.error && <p className="p-3 my-4 bg-red-100 text-red-700 rounded-md">{uiMessage.error}</p>}
            {uiMessage.success && <p className="p-3 my-4 bg-green-100 text-green-700 rounded-md">{uiMessage.success}</p>}
            
            <div className="flex justify-end">
                <button onClick={openCreateModal} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Add New Course</button>
            </div>
            
            <section className="p-6 bg-white rounded-xl shadow-lg">
                <h2 className="text-2xl font-semibold mb-4">Existing Courses</h2>
                <div className="space-y-4">
                    {(event.courses || []).length === 0 && <p className="text-gray-500">No courses have been added to this event yet.</p>}
                    {(event.courses || []).map(course => (
                        <div key={course._id} className="p-4 border rounded-lg bg-gray-50 hover:border-indigo-200">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <h3 className="font-bold text-lg text-gray-800">{course.title}</h3>
                                    <p className="text-sm text-gray-600 mt-1">{course.description}</p>
                                    <div className="mt-3 text-xs text-gray-500">
                                        <p className="font-semibold">{(course.slots || []).length} slot(s) available:</p>
                                        <ul className="list-disc list-inside pl-2">
                                            {(course.slots || []).map(slot => (
                                                <li key={slot._id}>{new Date(slot.time).toLocaleString()} - Capacity: {slot.maxCapacity}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                                <div className="space-x-4 flex-shrink-0 ml-4">
                                    <button onClick={() => openEditModal(course)} className="text-indigo-600 hover:underline font-semibold">Edit</button>
                                    <button onClick={() => handleDeleteCourse(course._id, course.title)} className="text-red-600 hover:underline font-semibold">Delete</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <CourseModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleAddOrUpdateCourse} courseToEdit={courseToEdit} />
        </div>
    );
}
export default CourseManagementPage;