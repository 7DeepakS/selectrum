import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';

const initialOfferingState = { course: '', slots: [{ id: Date.now(), time: new Date().toISOString().slice(0, 16), maxCapacity: 10, isActive: true }] };

// This single, smart modal handles both Creating a new Offering and Editing an existing one.
const CourseOfferingModal = ({ isOpen, onClose, onSave, offeringToEdit, catalogCourses, existingCourseIdsInEvent }) => {
    const [offeringData, setOfferingData] = useState(initialOfferingState);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // This effect runs whenever the modal is opened or the offering to edit changes.
        if (isOpen) {
            setError(''); // Clear previous errors
            if (offeringToEdit) {
                // We are EDITING. Populate the form with the existing offering's data.
                const editableSlots = (offeringToEdit.slots || []).map(s => ({
                    ...s, 
                    time: new Date(s.time).toISOString().slice(0, 16), // Format date for input
                    key: s._id || Date.now() + Math.random() // React key
                }));
                // The `course` field here should be the ID of the master course.
                setOfferingData({ ...offeringToEdit, course: offeringToEdit.course._id, slots: editableSlots });
            } else {
                // We are CREATING. Reset the form to its initial state.
                setOfferingData(initialOfferingState);
            }
        }
    }, [offeringToEdit, isOpen]);

    if (!isOpen) return null;

    // Form field handlers
    const handleSlotChange = (index, field, value) => {
        const slots = [...offeringData.slots];
        const finalValue = field === 'maxCapacity' ? parseInt(value, 10) || 0 : value;
        slots[index] = { ...slots[index], [field]: finalValue };
        setOfferingData(p => ({ ...p, slots }));
    };
    const addSlot = () => setOfferingData(p => ({ ...p, slots: [...p.slots, { key: Date.now(), time: new Date().toISOString().slice(0,16), maxCapacity: 10, isActive: true }]}));
    const removeSlot = (index) => { if (offeringData.slots.length > 1) setOfferingData(p => ({...p, slots: p.slots.filter((_, i) => i !== index)})); };
    const handleCourseSelection = (e) => setOfferingData(p => ({ ...p, course: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!offeringData.course) { setError('You must select a course from the catalog.'); return; }
        setIsSubmitting(true);
        try { 
            await onSave(offeringData); 
        } finally { 
            setIsSubmitting(false); 
        }
    };
    
    // When creating, filter out courses already in the event.
    const availableCourses = catalogCourses.filter(c => !existingCourseIdsInEvent.includes(c._id));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-semibold mb-4">{offeringToEdit ? `Edit Offering: ${offeringToEdit.course.title}` : 'Add New Course Offering'}</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium">Course from Catalog</label>
                        <select 
                            value={offeringData.course} 
                            onChange={handleCourseSelection} 
                            required 
                            disabled={!!offeringToEdit} // Disable when editing
                            className="w-full p-2 border rounded-md mt-1 disabled:bg-gray-200 disabled:cursor-not-allowed"
                        >
                            <option value="">-- Choose Course --</option>
                            {offeringToEdit ? 
                                <option value={offeringToEdit.course._id}>{offeringToEdit.course.title}</option> 
                                : availableCourses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)
                            }
                        </select>
                        {availableCourses.length === 0 && !offeringToEdit && <p className="text-xs text-gray-500 mt-1">All catalog courses are already in this event.</p>}
                    </div>
                    
                    <fieldset className="border p-4 rounded-lg"><legend>Define Slots for this Offering</legend>
                        {offeringData.slots.map((slot, index) => (
                           <div key={slot.key || index} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center mb-2 p-2 border-t relative">
                                <div className="md:col-span-2"><label className="text-xs font-medium">Time & Date</label><input type="datetime-local" value={slot.time} onChange={e => handleSlotChange(index, 'time', e.target.value)} required className="w-full p-2 border rounded-md mt-1" /></div>
                                <div><label className="text-xs font-medium">Capacity</label><input type="number" value={slot.maxCapacity} min="1" onChange={e => handleSlotChange(index, 'maxCapacity', e.target.value)} placeholder="Cap" required className="w-full p-2 border rounded-md mt-1" /></div>
                                <div className="flex items-center justify-between pt-5">
                                  <label className="flex items-center"><input type="checkbox" checked={slot.isActive} onChange={e => handleSlotChange(index, 'isActive', e.target.checked)} className="h-4 w-4 mr-2"/> Active</label>
                                  {offeringData.slots.length > 1 && (<button type="button" onClick={() => removeSlot(index)} className="text-red-500 font-bold hover:text-red-700">X</button>)}
                                </div>
                            </div>
                        ))}
                        <button type="button" onClick={addSlot} className="mt-2 p-2 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200">+ Add Slot</button>
                    </fieldset>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <div className="mt-6 flex justify-end space-x-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save Changes'}</button>
                </div>
            </form>
        </div>
    );
};


function CourseManagementPage() {
    const { eventId } = useParams();
    const [event, setEvent] = useState(null);
    const [catalogCourses, setCatalogCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uiMessage, setUiMessage] = useState({ type: '', text: '' });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [offeringToEdit, setOfferingToEdit] = useState(null);

    const setTimedMessage = (type, text, duration = 5000) => { setUiMessage({ type, text }); setTimeout(() => setUiMessage({ type: '', text: '' }), duration); };

    const fetchData = useCallback(async () => {
        // Don't set loading to true on refetches, only on initial load.
        if (!event) setLoading(true);
        try {
            const [eventRes, catalogRes] = await Promise.all([
                api.get(`events/${eventId}`),
                api.get('catalog/courses')
            ]);
            if (eventRes.data.success) setEvent(eventRes.data.data);
            else setTimedMessage('error', eventRes.data.error);
            if (catalogRes.data.success) setCatalogCourses(catalogRes.data.data);
            else setTimedMessage('error', catalogRes.data.error);
        } catch (err) { setTimedMessage('error', err.error || "Failed to load page data."); }
        finally { setLoading(false); }
    }, [eventId, event]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleAddOrUpdateOffering = async (offeringData) => {
    try {
        const response = offeringToEdit 
            // Correct PUT URL
            ? await api.put(`events/${eventId}/offerings/${offeringToEdit._id}`, offeringData)
            // Correct POST URL
            : await api.post(`events/${eventId}/offerings`, offeringData);

        if (response.data.success) {
            setTimedMessage('success', offeringToEdit ? 'Course offering updated!' : 'Course offering added!');
            setIsModalOpen(false);
            setOfferingToEdit(null);
            fetchData();
        } else { setTimedMessage('error', response.data.error); }
    } catch (err) { setTimedMessage('error', err.error); }
};

const handleDeleteCourseOffering = async (offeringId, courseTitle) => {
    if (!window.confirm(`Remove "${courseTitle}" from this event?`)) return;
    try {
        // Correct DELETE URL
        await api.delete(`events/${eventId}/offerings/${offeringId}`);
        setTimedMessage('success', 'Offering removed.');
        fetchData();
    } catch(err) { setTimedMessage('error', err.error); }
};

    const openCreateModal = () => { setOfferingToEdit(null); setIsModalOpen(true); };
    const openEditModal = (offering) => { setOfferingToEdit(offering); setIsModalOpen(true); };

    const courseTitleMap = useMemo(() => {
        const map = new Map();
        catalogCourses.forEach(c => map.set(c._id.toString(), c.title));
        return map;
    }, [catalogCourses]);

    if (loading) return <div className="p-8 text-center animate-pulse">Loading event details...</div>;
    if (!event) return <div className="p-8 text-center">Event not found. <Link to="/admin/events" className="text-indigo-600">Back</Link></div>;
    
    const existingCourseIdsInEvent = (event.courses || []).map(c => c.course._id);

    return (
        <div className="space-y-8">
            <div>
                <Link to="/admin/events" className="text-indigo-600 hover:underline">← Back to All Events</Link>
                <div className="flex justify-between items-center mt-1">
                    <h1 className="text-3xl font-bold">Manage Courses for: <span className="text-indigo-600">{event.name}</span></h1>
                    <button onClick={openCreateModal} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Add Course Offering</button>
                </div>
            </div>
            {uiMessage.error && <p className="p-3 my-4 bg-red-100 text-red-700 rounded-md">{uiMessage.error}</p>}
            {uiMessage.success && <p className="p-3 my-4 bg-green-100 text-green-700 rounded-md">{uiMessage.success}</p>}
            
            <section className="p-6 bg-white rounded-xl shadow-lg">
                <h2 className="text-2xl font-semibold mb-4">Offered Courses</h2>
                <div className="space-y-4">
                    {(event.courses || []).length === 0 && <p className="text-gray-500">No courses have been offered for this event yet.</p>}
                    {(event.courses || []).map(offering => {
                        const courseInfo = offering.course; // The backend populates this
                        if (!courseInfo) return null; // Safeguard for inconsistent data

                        return (
                            <div key={offering._id} className="p-4 border rounded-lg bg-gray-50 hover:border-indigo-200 transition">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg text-gray-800">{courseInfo.title}</h3>
                                        <p className="text-sm text-gray-600 mt-1">{courseInfo.description}</p>
                                        <div className="mt-3 text-xs text-gray-500">
                                            <p className="font-semibold">{(offering.slots || []).length} slot(s) offered:</p>
                                            <ul className="list-disc list-inside pl-2">
                                                {(offering.slots || []).map(slot => (
                                                    <li key={slot._id}>
                                                        {new Date(slot.time).toLocaleString()} - 
                                                        Capacity: {slot.maxCapacity} - 
                                                        Status: {slot.isActive ? 'Active' : 'Inactive'}
                                                    </li>
                                                ))}
                                            </ul>
                                            {(courseInfo.prerequisites || []).length > 0 && (
                                                <div className="mt-2">
                                                    <p className="font-semibold">Prerequisites:</p>
                                                    <ul className="list-disc list-inside pl-2">
                                                        {courseInfo.prerequisites.map(prereqId => (
                                                            <li key={prereqId}>{courseTitleMap.get(prereqId.toString()) || 'Loading...'}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-x-4 flex-shrink-0 ml-4">
                                        <button onClick={() => openEditModal(offering)} className="text-indigo-600 hover:underline font-semibold">Edit Slots</button>
                                        <button onClick={() => handleDeleteCourseOffering(offering._id, courseInfo.title)} className="text-red-600 hover:underline font-semibold">Remove</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <CourseOfferingModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onSave={handleAddOrUpdateOffering} 
                offeringToEdit={offeringToEdit}
                catalogCourses={catalogCourses}
                existingCourseIdsInEvent={existingCourseIdsInEvent}
            />
        </div>
    );
}
export default CourseManagementPage;