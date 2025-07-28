import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, XCircle, RefreshCw, Lock, Eye } from 'react-feather';

// ----- Reusable Modal Component -----
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, children, confirmText = 'Confirm', closeText = 'Cancel', isInfoOnly = false }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-indigo-700 mb-4">{title}</h3>
        <div className="mb-6 text-gray-600">{children}</div>
        <div className="flex justify-end space-x-4">
          {!isInfoOnly && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
              aria-label={closeText}
            >
              {closeText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label={isInfoOnly ? 'OK' : confirmText}
          >
            {isInfoOnly ? 'OK' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

function StudentView() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [userEnrollments, setUserEnrollments] = useState([]);
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uiMessage, setUiMessage] = useState({ type: '', text: '' });
  const [enrollmentLoading, setEnrollmentLoading] = useState(null);
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    content: null,
    onConfirm: () => {},
    confirmText: 'Confirm',
    isInfoOnly: false,
  });

  const setFeedbackMessage = (type, text, duration = 7000) => {
    setUiMessage({ type, text });
    if (duration > 0) setTimeout(() => setUiMessage({ type: '', text: '' }), duration);
  };

  const fetchData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);
    try {
      const [eventsResponse, enrollmentsResponse] = await Promise.all([
        api.get('/events'),
        api.get('/users/my-enrollments'),
      ]);

      if (eventsResponse.data.success) {
        setEvents(eventsResponse.data.data || []);
      } else {
        setFeedbackMessage('error', eventsResponse.data.error || 'Failed to load event data.');
      }
      if (enrollmentsResponse.data.success) {
        const enrollments = enrollmentsResponse.data.data.enrollments || [];
        setUserEnrollments(enrollments);
      } else {
        setFeedbackMessage('error', enrollmentsResponse.data.error || 'Failed to load enrollment data.');
      }
    } catch (err) {
      setFeedbackMessage('error', err.error || err.message || 'Failed to fetch data.');
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    const handleFocus = () => {
      fetchData(false); 
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchData]);

  const handleEnrollClick = (event, offering, slot) => {
    const courseTitle = offering.masterCourse?.title;
    if (!slot?.id || !event?._id || !offering?._id || !courseTitle) {
      setFeedbackMessage('error', 'Invalid slot, course, or event data.');
      return;
    }
    setModalState({
      isOpen: true,
      title: 'Confirm Enrollment',
      content: (
        <p>
          Are you sure you want to enroll in <strong>{courseTitle}</strong> at{' '}
          {new Date(slot.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}?
        </p>
      ),
      onConfirm: () => performEnrollment(event._id, offering._id, slot.id, courseTitle),
      isInfoOnly: false,
      confirmText: 'Yes, Enroll',
    });
  };

  const performEnrollment = async (eventId, courseId, slotId, courseTitle) => {
    if (!eventId || !courseId || !slotId) {
      setFeedbackMessage('error', 'Invalid enrollment data.');
      return;
    }
    const url = `/events/${eventId}/courses/${courseId}/slots/${slotId}/enroll`;
    const slotIdentifier = `${eventId}-${courseId}-${slotId}`;
    setEnrollmentLoading(slotIdentifier);
    setModalState(prev => ({ ...prev, isOpen: false }));
    setFeedbackMessage('', '');
    try {
      const response = await api.post(url);
      if (response.data.success) {
        setFeedbackMessage('success', response.data.message || 'Enrollment successful!');
        fetchData();
      }
    } catch (err) {
      const errorMessage = err.error || 'An unexpected error occurred.';
      setModalState({
        isOpen: true,
        title: 'Enrollment Failed',
        content: ( <div> <p className="mb-2">{errorMessage}</p> </div> ),
        onConfirm: () => setModalState({ isOpen: false }),
        isInfoOnly: true,
      });
      fetchData();
    } finally {
      setEnrollmentLoading(null);
    }
  };

  const closeModal = () => {
    setModalState({ isOpen: false });
  };

  const toggleEvent = eventId => {
    setExpandedEventId(prev => (prev === eventId ? null : eventId));
  };

  const processedEvents = useMemo(() => {
    if (!Array.isArray(events) || events.length === 0) return [];
    const allTakenCourseIds = new Set((userEnrollments || []).map(e => String(e.courseId)));

    return events
      .filter(event => event.isOpen)
      .map(event => {
        const eventIdStr = String(event._id);
        const enrollmentsInThisEvent = (userEnrollments || []).filter(e => String(e.eventId) === eventIdStr);
        const hasReachedEventLimit = enrollmentsInThisEvent.length >= (event.maxCoursesPerStudent || Infinity);
        const courseIdsInThisEvent = new Set(enrollmentsInThisEvent.map(e => String(e.courseId)));

        const processedCourses = (event.courses || [])
          .map(offering => {
            if (!offering.masterCourse) return null;
            const isDepartmentAllowed = !event.allowedDepartments || event.allowedDepartments.length === 0 || (user.department && event.allowedDepartments.includes(user.department));
            const masterCourseId = String(offering.masterCourse._id);
            const isEnrolledInThisOffering = courseIdsInThisEvent.has(masterCourseId);
            const hasTakenThisCourseBefore = allTakenCourseIds.has(masterCourseId);
            const unmetPrerequisites = (offering.masterCourse.prerequisites || []).filter(p => !allTakenCourseIds.has(String(p._id))).map(p => p.title);
            const prereqsMet = unmetPrerequisites.length === 0;
            return {
              ...offering,
              isEnrolledInThisOffering,
              hasTakenThisCourseBefore,
              prereqsMet,
              unmetPrerequisites,
              isDepartmentAllowed,
              slots: (offering.slots || []).map(slot => ({
                ...slot,
                availableCapacity: slot.maxCapacity - (slot.enrolled || []).length,
              })),
            };
          })
          .filter(Boolean)
          .filter(offering => offering.isEnrolledInThisOffering || !offering.hasTakenThisCourseBefore);

        return {
          ...event,
          courses: processedCourses,
          hasReachedEventLimit,
          enrolledCourseTitles: enrollmentsInThisEvent.map(e => e.courseTitle).filter(Boolean),
        };
      });
  }, [events, userEnrollments, user.department]);

  if (loading) {
    return (
      <div className="p-6 text-center text-lg flex justify-center items-center bg-indigo-50 min-h-screen">
        <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z"></path>
        </svg>
        Loading events...
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto bg-indigo-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-indigo-700">
          Event Enrollment
          {user?.name && <span className="block sm:inline text-xl font-medium text-gray-600 ml-0 sm:ml-2">Welcome, {user.name}</span>}
        </h2>
        <button
          onClick={() => fetchData(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500"
          aria-label="Refresh data"
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Refresh
        </button>
      </div>

      {uiMessage.text && (
        <div className="max-w-4xl mx-auto mb-6">
          <div
            className={`flex items-center p-4 rounded-lg border shadow-sm ${
              uiMessage.type === 'error' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-green-100 border-green-400 text-green-700'
            }`}
            role="alert"
          >
            {uiMessage.type === 'error' ? (
              <XCircle className="w-5 h-5 mr-2" />
            ) : (
              <CheckCircle className="w-5 h-5 mr-2" />
            )}
            <span>{uiMessage.text}</span>
            <button
              onClick={() => setUiMessage({ type: '', text: '' })}
              className="ml-auto text-sm font-semibold hover:underline"
              aria-label="Dismiss message"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {processedEvents.length === 0 && !loading && (
        <div className="text-center p-10 bg-white rounded-xl shadow-lg">
          <p className="text-gray-600 text-xl">No open events are available for enrollment.</p>
          <p className="text-gray-500 mt-2">Please check back later or contact support.</p>
        </div>
      )}

      {processedEvents.length > 0 && (
        <div className="space-y-6">
          {processedEvents.map(event => (
              <div key={event._id} className="border rounded-xl shadow-lg hover:shadow-xl transition-all overflow-hidden bg-white">
                <div
                  className="p-5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white cursor-pointer flex justify-between items-center"
                  onClick={() => toggleEvent(event._id)}
                >
                  <div>
                    <h4 className="text-xl font-semibold">{event.name || 'Unnamed Event'}</h4>
                    <p className="text-sm opacity-90">
                      {event.isViewOnly ? '👁️ View Only' : '🟢 Open for Enrollment'} | {event.courses?.length || 0} course(s) available for you | Max {event.maxCoursesPerStudent || 'Unlimited'}
                    </p>
                    {event.enrolledCourseTitles.length > 0 && (
                      <div className="mt-2 inline-flex items-center bg-green-200 text-green-800 text-xs font-semibold px-2.5 py-1 rounded-full">
                        <CheckCircle className="w-4 h-4 mr-1.5" />
                        Enrolled in: {event.enrolledCourseTitles.join(', ')}
                      </div>
                    )}
                  </div>
                  <span className={`text-2xl transform transition-transform duration-300 ${expandedEventId === event._id ? 'rotate-180' : 'rotate-0'}`}>
                    ▼
                  </span>
                </div>

                {expandedEventId === event._id && (
                  <div className="px-4 py-6">
                    {event.courses?.length === 0 && <p className="text-gray-500 p-4 text-center">No new courses available for you in this event.</p>}
                    
                    {event.isViewOnly && (
                      <div className="text-center p-3 mb-4 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-md text-sm max-w-2xl mx-auto flex items-center justify-center">
                        <Eye className="w-4 h-4 mr-2" />
                        This event is for viewing only. Enrollment is currently disabled.
                      </div>
                    )}

                    {event.hasReachedEventLimit && !event.isViewOnly && (
                      <div className="text-center p-3 mb-4 bg-indigo-100 border border-indigo-300 text-indigo-700 rounded-md text-sm max-w-2xl mx-auto">
                        You have reached the enrollment limit for this event.
                      </div>
                    )}

                    <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {(event.courses || []).map(offering => {
                        const slot = (offering.slots || [])[0];
                        if (!slot) return null;
                        const slotIdentifier = `${event._id}-${offering._id}-${slot.id}`;
                        const isFull = slot.availableCapacity <= 0;
                        const isLoadingThisSlot = enrollmentLoading === slotIdentifier;

                        let buttonState = { text: 'Enroll', disabled: false, className: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500' };

                        if (offering.isEnrolledInThisOffering) {
                            buttonState = { text: '✓ Enrolled', disabled: true, className: 'bg-green-600 cursor-default' };
                        } else if (event.isViewOnly) {
                            buttonState = { text: 'View Only', disabled: true, className: 'bg-gray-400 cursor-not-allowed' };
                        } else if (!offering.isDepartmentAllowed) {
                            buttonState = { text: 'Dept. Restricted', disabled: true, className: 'bg-gray-400 cursor-not-allowed' };
                        } else if (offering.hasTakenThisCourseBefore) {
                            // This state is now filtered out before rendering, but the logic remains as a safeguard.
                            buttonState = { text: '✓ Completed', disabled: true, className: 'bg-blue-600 cursor-default' };
                        } else if (event.hasReachedEventLimit) {
                            buttonState = { text: 'Event Limit Reached', disabled: true, className: 'bg-gray-400 cursor-not-allowed' };
                        } else if (!offering.prereqsMet) {
                            buttonState = { text: 'Prerequisites Not Met', disabled: true, className: 'bg-gray-400 cursor-not-allowed' };
                        } else if (isFull) {
                            buttonState = { text: 'Slot Full', disabled: true, className: 'bg-gray-400 cursor-not-allowed' };
                        } else if (isLoadingThisSlot) {
                            buttonState = { text: 'Processing...', disabled: true, className: 'bg-gray-500 animate-pulse' };
                        }
                        
                        return (
                          <div key={slotIdentifier} className={`p-4 border rounded-lg shadow-md hover:shadow-lg transition-all flex flex-col justify-between ${buttonState.disabled && !offering.isEnrolledInThisOffering ? 'opacity-70' : ''}`}>
                            <div>
                              <h5 className="font-semibold text-lg text-indigo-700">{offering.masterCourse?.title || 'Unnamed Course'}</h5>
                              {offering.masterCourse?.description && <p className="text-sm text-gray-600 mb-2">{offering.masterCourse.description}</p>}
                              
                              {!offering.prereqsMet && !event.isViewOnly && (
                                <div className="text-sm text-red-600 font-semibold my-2 p-2 bg-red-50 border border-red-200 rounded">
                                  <Lock className="w-4 h-4 inline-block mr-1" />
                                  Requires: {offering.unmetPrerequisites.join(', ')}
                                </div>
                              )}

                              {!offering.isDepartmentAllowed && !event.isViewOnly && (
                                <div className="text-sm text-orange-600 font-semibold my-2 p-2 bg-orange-50 border border-orange-200 rounded">
                                  <Lock className="w-4 h-4 inline-block mr-1" />
                                  Enrollment is restricted to other departments.
                                </div>
                              )}
                              
                              <p className="text-sm text-gray-600">
                                🕒 {new Date(slot.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                              </p>
                              <p className="text-sm text-gray-600 mb-2">
                                👥 Available: {slot.availableCapacity} / {slot.maxCapacity}
                              </p>
                              <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden my-2">
                                  <div
                                    className={`h-full transition-all duration-500 ease-out ${
                                      (slot.maxCapacity > 0 && slot.availableCapacity <= 0) ? 'bg-red-600' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${100 - (slot.availableCapacity / slot.maxCapacity) * 100}%` }}
                                  />
                              </div>
                            </div>
                            <button
                              onClick={() => handleEnrollClick(event, offering, slot)}
                              disabled={buttonState.disabled}
                              className={`mt-4 w-full py-2.5 px-4 rounded-lg text-white font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonState.className}`}
                              aria-label={buttonState.text}
                            >
                              {isLoadingThisSlot ? (
                                  <span className="flex items-center justify-center">
                                    <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z"></path>
                                    </svg>
                                    Processing...
                                  </span>
                                ) : (
                                  buttonState.text
                                )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
          ))}
        </div>
      )}
      <ConfirmationModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        onConfirm={modalState.onConfirm}
        title={modalState.title}
        confirmText={modalState.confirmText}
        isInfoOnly={modalState.isInfoOnly}
      >
        {modalState.content}
      </ConfirmationModal>
    </div>
  );
}

export default StudentView;