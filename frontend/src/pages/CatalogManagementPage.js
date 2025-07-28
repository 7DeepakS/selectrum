// src/pages/CatalogManagementPage.js
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

// Reusable Modal for Creating/Editing a Course in the Catalog
const CatalogCourseModal = ({ isOpen, onClose, onSave, courseToEdit, allCourses }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [prerequisites, setPrerequisites] = useState([]);

    useEffect(() => {
        if (isOpen) {
            setTitle(courseToEdit?.title || '');
            setDescription(courseToEdit?.description || '');
            setPrerequisites(courseToEdit?.prerequisites?.map(p => p._id) || []);
        }
    }, [isOpen, courseToEdit]);

    if (!isOpen) return null;
    
    const handleSave = () => {
        onSave({ _id: courseToEdit?._id, title, description, prerequisites });
    };

    const availablePrereqs = allCourses.filter(c => c._id !== courseToEdit?._id);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg w-full max-w-xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-semibold mb-4">{courseToEdit ? 'Edit Course' : 'Create New Course'}</h3>
                <div className="space-y-4">
                    <div><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border rounded"/></div>
                    <div><label>Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows="3" className="w-full p-2 border rounded"/></div>
                    <div>
                        <label>Prerequisites (Ctrl/Cmd to select multiple)</label>
                        <select multiple value={prerequisites} onChange={e => setPrerequisites(Array.from(e.target.selectedOptions, o => o.value))} className="w-full h-40 p-2 border rounded">
                            {availablePrereqs.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
                        </select>
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded">Save Course</button>
                </div>
            </div>
        </div>
    );
};

function CatalogManagementPage() {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchCourses = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('catalog/courses');
            setCourses(response.data.data || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchCourses(); }, [fetchCourses]);

    const handleSaveCourse = async (courseData) => {
        try {
            if (courseData._id) { // Editing
                await api.put(`catalog/courses/${courseData._id}`, courseData);
            } else { // Creating
                await api.post('catalog/courses', courseData);
            }
            setIsModalOpen(false);
            fetchCourses();
        } catch (err) {
            console.error("Failed to save course", err);
            alert(err.error || "Could not save course.");
        }
    };

    const handleDeleteCourse = async (courseId, courseTitle) => {
        if (!window.confirm(`Delete "${courseTitle}" from the catalog? This is permanent.`)) return;
        try {
            await api.delete(`catalog/courses/${courseId}`);
            fetchCourses();
        } catch (err) {
             alert(err.error || "Could not delete course.");
        }
    };

    if (loading) return <div>Loading Course Catalog...</div>;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Course Catalog Management</h1>
                <button onClick={() => { setSelectedCourse(null); setIsModalOpen(true); }} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg">Add New Course</button>
            </div>
            
            <section className="p-6 bg-white rounded-xl shadow-lg">
                <div className="space-y-4">
                    {courses.map(course => (
                        <div key={course._id} className="p-4 border rounded-lg bg-gray-50 flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-lg">{course.title}</h3>
                                <p className="text-sm text-gray-600">{course.description}</p>
                                {(course.prerequisites || []).length > 0 && (
                                    <div className="text-xs mt-2">
                                        <span className="font-semibold">Prerequisites: </span>
                                        <span>{course.prerequisites.map(p => p.title).join(', ')}</span>
                                    </div>
                                )}
                            </div>
                            <div className="space-x-4 flex-shrink-0 ml-4">
                                <button onClick={() => { setSelectedCourse(course); setIsModalOpen(true); }} className="text-indigo-600 font-semibold">Edit</button>
                                <button onClick={() => handleDeleteCourse(course._id, course.title)} className="text-red-600 font-semibold">Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
            
            <CatalogCourseModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveCourse}
                courseToEdit={selectedCourse}
                allCourses={courses}
            />
        </div>
    );
}

export default CatalogManagementPage;