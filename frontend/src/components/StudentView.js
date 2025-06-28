// src/components/StudentView.js
import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';

function StudentView() {
  const { user, setUser } = useContext(AuthContext); 
  const [events, setEvents] = useState([]);
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uiMessage, setUiMessage] = useState({ type: '', text: '' });
  const [enrollmentLoading, setEnrollmentLoading] = useState(null);

  const setFeedbackMessage = (type, text, duration = 7000) => {
    setUiMessage({ type, text });
    if (duration) {
      setTimeout(() => setUiMessage({ type: '', text: '' }), duration);
    }
  };

  const fetchEvents = useCallback(async () => {
    if (events.length === 0) setLoading(true); // Only show main loading if initially empty
    try {
      const response = await api.get('/events');
      if (response.data.success) {
        setEvents(response.data.data || []);
      } else {
        setFeedbackMessage('error', response.data.error || 'Failed to load event data.');
      }
    } catch (err) {
      setFeedbackMessage('error', err.error || err.message || 'Failed to fetch events.');
      console.error('Fetch events error:', err);
    } finally {
      setLoading(false);
    }
  }, [events.length]); // Add events.length to dependencies

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const enroll = useCallback(
    async (eventId, courseId, slotNumericId) => {
      const slotIdentifier = `${eventId}-${courseId}-${slotNumericId}`;
      setEnrollmentLoading(slotIdentifier);
      setFeedbackMessage('', '');
      try {
        const response = await api.post(`/events/${eventId}/courses/${courseId}/slots/${slotNumericId}/enroll`);
        if (response.data.success) {
          setFeedbackMessage('success', response.data.message || 'Enrolled successfully!');
          
          const localUser = localStorage.getItem('user');
          if (localUser && setUser) {
            try {
              const parsedUser = JSON.parse(localUser);
              const updatedUser = {...parsedUser, selectedEvent: eventId };
              setUser(updatedUser); 
              localStorage.setItem('user', JSON.stringify(updatedUser));
            } catch(e) { console.error("Error updating local user state", e);}
          }
          fetchEvents(); 
        } else {
          setFeedbackMessage('error', response.data.error || 'Enrollment failed.');
        }
      } catch (err) {
        setFeedbackMessage('error', err.error || err.message || 'Enrollment request failed.');
        console.error('Enrollment error:', err);
      } finally {
        setEnrollmentLoading(null);
      }
    },
    [fetchEvents, setUser] 
  );

  const openEvents = useMemo(() => events.filter((e) => e.isOpen), [events]);

  const toggleEvent = (eventId) => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId));
  };

  if (loading && events.length === 0) return <div className="p-6 text-center text-lg animate-pulse">Loading events...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-6 text-gray-800">
        Event Enrollment {user?.name ? `- Welcome, ${user.name}` : ''}
      </h2>

      {uiMessage.text && (
        <p className={`text-center mb-6 font-medium p-3 rounded-md border ${
            uiMessage.type === 'error' ? 'bg-red-100 border-red-400 text-red-700' 
                                       : 'bg-green-100 border-green-400 text-green-700'
        }`}>
          {uiMessage.text}
        </p>
      )}
      
      {openEvents.length === 0 && !loading && (
        <p className="text-gray-600 text-center text-lg">No open events available for enrollment at the moment.</p>
      )}

      {openEvents.length > 0 && (
        <div className="space-y-6">
          {openEvents.map((event) => {
            // event.isEnrolledInEvent is calculated by the backend GET /events route
            const alreadyEnrolledInThisEvent = event.isEnrolledInEvent; 

            return (
              <div
                key={event._id}
                className="border rounded-xl shadow-lg hover:shadow-xl transition-all overflow-hidden"
              >
                <div
                  className="p-5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white cursor-pointer flex justify-between items-center"
                  onClick={() => toggleEvent(event._id)}
                >
                  <div>
                    <h4 className="text-xl font-semibold">{event.name}</h4>
                    <p className="text-sm opacity-90">
                      {event.isOpen ? '🟢 Open' : '🔒 Closed'} | {event.courses.length} Course(s)
                    </p>
                    {alreadyEnrolledInThisEvent && (
                        <span className="mt-1 inline-block bg-green-200 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                            You have selected a course in this event
                        </span>
                    )}
                  </div>
                  <span className="text-2xl transform transition-transform duration-300">
                    {expandedEventId === event._id ? '▲' : '▼'}
                  </span>
                </div>

                {expandedEventId === event._id && (
                  <div className="bg-white px-4 py-6">
                    {event.courses.length === 0 && <p className="text-gray-500 p-4">No courses available in this event yet.</p>}
                    
                    {alreadyEnrolledInThisEvent && (
                        <p className="text-center p-3 mb-4 bg-sky-50 border border-sky-300 text-sky-700 rounded-md text-sm">
                            You are already enrolled in a course for this event. You can only choose one per event.
                        </p>
                    )}

                    <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {event.courses.map((course) =>
                      course.slots.map((slot) => {
                        const slotIdentifier = `${event._id}-${course._id}-${slot.id}`;
                        const isFull = slot.availableCapacity <= 0;
                        
                        const isDisabled = 
                            (alreadyEnrolledInThisEvent && !slot.isEnrolled) || // Disabled if in this event but NOT this specific slot
                            isFull || 
                            !slot.isActive ||
                            (slot.isEnrolled && alreadyEnrolledInThisEvent); // Explicitly handle if it's the enrolled slot
                            
                        const isLoadingThisSlot = enrollmentLoading === slotIdentifier;

                        const percentFull = Math.min(
                          (slot.enrolled.length / slot.maxCapacity) * 100,
                          100
                        );

                        let buttonText = 'Enroll';
                        if (slot.isEnrolled) buttonText = '✓ Enrolled Here';
                        else if (alreadyEnrolledInThisEvent) buttonText = 'Course Selected'; 
                        else if (isFull) buttonText = 'Slot Full';
                        else if (!slot.isActive) buttonText = 'Slot Inactive';
                        if (isLoadingThisSlot) buttonText = 'Processing...';

                        return (
                          <div
                            key={`${course._id}-${slot.id}`} // course has _id, slot has numeric id
                            className={`p-5 border rounded-lg shadow-md hover:shadow-lg transition-all flex flex-col justify-between 
                                        ${!slot.isActive ? 'bg-gray-100 opacity-70' : 'bg-white'}
                                        ${(isDisabled && !slot.isEnrolled) ? 'opacity-60' : ''}`}
                          >
                            <div>
                              <h5 className="font-semibold text-lg text-gray-800">{course.title}</h5>
                              {course.description && <p className="text-sm text-gray-600 mb-2">{course.description}</p>}
                              <p className="text-sm text-gray-500">🕒 {new Date(slot.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                              <p className="text-sm text-gray-500 mb-2">
                                 👥 Capacity: {slot.enrolled.length}/{slot.maxCapacity} ({slot.availableCapacity} left)
                              </p>
                              {!slot.isActive && <p className="text-xs text-red-500 font-semibold mb-1">SLOT INACTIVE</p>}

                              <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden my-2">
                                <div
                                  className={`h-full transition-all duration-500 ease-out ${
                                    percentFull >= 100 ? 'bg-red-600'
                                    : percentFull >= 75 ? 'bg-yellow-500'
                                    : 'bg-green-500'
                                  }`}
                                  style={{ width: `${percentFull}%` }}
                                  title={`${percentFull.toFixed(0)}% Full`}
                                />
                              </div>
                            </div>

                            <button
                              onClick={() => enroll(event._id, course._id, slot.id)} // course._id
                              disabled={isDisabled || isLoadingThisSlot}
                              className={`mt-3 w-full py-2.5 px-4 rounded-lg text-white font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2
                                ${isDisabled || isLoadingThisSlot
                                  ? (slot.isEnrolled ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' : 'bg-gray-400 cursor-not-allowed')
                                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                                }
                              `}
                            >
                              {buttonText}
                            </button>
                          </div>
                        );
                      })
                    )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default StudentView;