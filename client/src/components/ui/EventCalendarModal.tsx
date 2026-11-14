import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  Compass,
  Plus,
  Trash2,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';
import { ApiService } from '../../services/api';
import { CampusEventItem } from '../../../../shared/types';

// Official 2026 Academic & Kerala Public Holidays for Christ College (Autonomous) Irinjalakuda
// No mock or sample events are included. Any future events will be scheduled by the Admin.
const DEFAULT_EVENTS: CampusEventItem[] = [
  {
    id: 'hol_2026_01',
    title: 'Mannam Jayanthi',
    description: 'Public holiday in Kerala commemorating social reformer Mannathu Padmanabhan.',
    date: '2026-01-02',
    time: 'Full Day',
    venue: 'College Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_02',
    title: 'St. Kuriakose Elias Chavara Day',
    description: "Feast day of St. Kuriakose Elias Chavara, founding patron of the CMI congregation and Christ College.",
    date: '2026-01-03',
    time: 'Full Day',
    venue: 'Institutional Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_03',
    title: 'Republic Day',
    description: 'National holiday celebrating the Constitution of India. Ceremonial flag hoisting at the Admin square.',
    date: '2026-01-26',
    time: 'Full Day',
    venue: 'National Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_04',
    title: 'Maha Shivratri',
    description: 'Statewide religious observance and public holiday across Kerala.',
    date: '2026-02-15',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_05',
    title: 'Id-ul-Fitr (Ramadan)',
    description: 'Public holiday marking the conclusion of the holy month of Ramadan (subject to moon sighting).',
    date: '2026-03-20',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_06',
    title: 'Maundy Thursday',
    description: 'Holy Week religious observance and institutional holiday commemorating the Last Supper.',
    date: '2026-04-02',
    time: 'Full Day',
    venue: 'Institutional Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_07',
    title: 'Good Friday',
    description: 'Solemn Christian observance and national holiday for the Passion and crucifixion of Christ.',
    date: '2026-04-03',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_08',
    title: 'Easter Sunday',
    description: 'Christian celebration of the resurrection of Jesus Christ.',
    date: '2026-04-05',
    time: 'Full Day',
    venue: 'Christian Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_09',
    title: 'Vishu & Dr. B.R. Ambedkar Jayanthi',
    description: 'Kerala astronomical New Year (Vishu) and Dr. B.R. Ambedkar Jayanthi public holiday.',
    date: '2026-04-14',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_10',
    title: 'May Day (International Workers\' Day)',
    description: 'International Labour Day public holiday observed across all educational institutions.',
    date: '2026-05-01',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_11',
    title: 'Bakrid / Id-ul-Adha',
    description: 'Statewide public holiday celebrating the Feast of Sacrifice (subject to moon sighting).',
    date: '2026-05-27',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_12',
    title: 'Muharram',
    description: 'First month of the Islamic calendar and statewide public holiday in Kerala.',
    date: '2026-06-26',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_13',
    title: 'Karkidaka Vavu',
    description: 'Traditional ancestral remembrance observance and public holiday across Kerala.',
    date: '2026-07-13',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_14',
    title: 'Independence Day',
    description: 'National holiday commemorating Indian Independence. Ceremonial flag hoisting on campus.',
    date: '2026-08-15',
    time: 'Full Day',
    venue: 'National Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_15',
    title: 'First Onam (Uthradam)',
    description: 'Eve of Thiruvonam and commencement of official Onam holidays across Kerala.',
    date: '2026-08-26',
    time: 'Full Day',
    venue: 'State Festival Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_16',
    title: 'Thiruvonam & Milad-e-Sherif (Nabi Dinam)',
    description: 'Main celebration day of Onam harvest festival and Milad-e-Sherif state holiday.',
    date: '2026-08-27',
    time: 'Full Day',
    venue: 'State Festival Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_17',
    title: 'Third Onam (Avittom)',
    description: 'Third official day of statewide Onam festival holidays.',
    date: '2026-08-28',
    time: 'Full Day',
    venue: 'State Festival Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_18',
    title: 'Fourth Onam & Sree Narayana Guru Jayanthi',
    description: 'Fourth day of Onam and birth anniversary of social reformer Sree Narayana Guru.',
    date: '2026-08-29',
    time: 'Full Day',
    venue: 'State Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_19',
    title: 'Sree Krishna Jayanthi (Janmashtami)',
    description: 'Statewide public holiday celebrating the birth of Lord Krishna.',
    date: '2026-09-03',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_20',
    title: 'Sree Narayana Guru Samadhi',
    description: 'Statewide public holiday commemorating the Samadhi of Sree Narayana Guru.',
    date: '2026-09-21',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_21',
    title: 'Gandhi Jayanti',
    description: 'National holiday honoring Mahatma Gandhi. Campus observance and Clean Campus campaign.',
    date: '2026-10-02',
    time: 'Full Day',
    venue: 'National Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_22',
    title: 'Mahanavami / Ayudha Puja',
    description: 'Ninth day of Navaratri and Ayudha Puja statewide public holiday in Kerala.',
    date: '2026-10-19',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_23',
    title: 'Vijayadashami / Vidyarambham',
    description: 'Vijayadashami celebration of knowledge, initiation into learning, and public holiday.',
    date: '2026-10-20',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_24',
    title: 'Kerala Piravi (State Formation Day)',
    description: 'Institutional celebration commemorating the formation of Kerala State on Nov 1, 1956.',
    date: '2026-11-01',
    time: 'Full Day',
    venue: 'State Observance',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_25',
    title: 'Deepavali (Diwali)',
    description: 'Festival of Lights statewide public holiday celebrated across Kerala.',
    date: '2026-11-08',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_26',
    title: 'Christmas Eve / Winter Vacation Commences',
    description: 'Commencement of college winter vacation and Christmas recess for students and faculty.',
    date: '2026-12-24',
    time: 'Full Day',
    venue: 'Institutional Vacation',
    venueNodeId: '',
    category: 'Leave',
  },
  {
    id: 'hol_2026_27',
    title: 'Christmas Day',
    description: 'Celebration of the Nativity of Jesus Christ. Public and institutional holiday.',
    date: '2026-12-25',
    time: 'Full Day',
    venue: 'Public Holiday',
    venueNodeId: '',
    category: 'Holiday',
  },
  {
    id: 'hol_2026_28',
    title: 'Boxing Day / Winter Recess',
    description: 'College winter recess and vacation continues.',
    date: '2026-12-26',
    time: 'Full Day',
    venue: 'Institutional Vacation',
    venueNodeId: '',
    category: 'Leave',
  },
];

const VENUE_OPTIONS = [
  { name: 'Campus Wide / Holiday (No Specific Venue)', nodeId: '' },
  { name: "St. Joseph's Auditorium", nodeId: 'outdoor_028' },
  { name: 'Fr. Jose Thekkan Seminar Hall', nodeId: 'outdoor_028' },
  { name: 'Athletic Stadium & Track', nodeId: 'outdoor_327' },
  { name: "St. Joseph's Science Block", nodeId: 'outdoor_191' },
  { name: 'Central Library & Reading Hall', nodeId: 'outdoor_201' },
  { name: 'Open Air Stage & Quadrangle', nodeId: 'outdoor_021' },
  { name: 'Administrative Block Council Hall', nodeId: 'ab_044' },
  { name: 'Campus Green Boulevard', nodeId: 'outdoor_015' },
  { name: 'College Canteen & Cafeteria', nodeId: 'outdoor_155' },
];

const STORAGE_KEY = 'waycampus_events_v3';

interface EventCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

export const EventCalendarModal: React.FC<EventCalendarModalProps> = ({ isOpen, onClose, isAdmin = false }) => {
  const { setActivePanoramaId, setActiveTab } = useNavigation();
  const [eventToDelete, setEventToDelete] = useState<CampusEventItem | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);

  // Load events from persistent storage; purge older versions with mock events
  const [events, setEvents] = useState<CampusEventItem[]>(() => {
    try {
      localStorage.removeItem('waycampus_events_v1');
      localStorage.removeItem('waycampus_events_v2');
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // quiet fallback
    }
    return DEFAULT_EVENTS;
  });

  const saveEvents = (updated: CampusEventItem[]) => {
    setEvents(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('campnav_events_updated'));
    } catch {
      // quiet fallback
    }
  };

  // Sync events in real-time across tabs / modal openings and from API
  useEffect(() => {
    const reload = async () => {
      try {
        const apiRes = await ApiService.getEvents().catch(() => ({ success: false, events: [] }));
        if (apiRes && apiRes.success && Array.isArray(apiRes.events) && apiRes.events.length > 0) {
          setEvents(apiRes.events);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(apiRes.events));
          return;
        }

        localStorage.removeItem('waycampus_events_v1');
        localStorage.removeItem('waycampus_events_v2');
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEvents(parsed);
            return;
          }
        }
        setEvents(DEFAULT_EVENTS);
      } catch {
        // quiet fallback
        setEvents(DEFAULT_EVENTS);
      }
    };
    if (isOpen) {
      reload();
    }
    window.addEventListener('storage', reload);
    window.addEventListener('campnav_events_updated', reload);
    return () => {
      window.removeEventListener('storage', reload);
      window.removeEventListener('campnav_events_updated', reload);
    };
  }, [isOpen]);

  // Calendar View State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  // Admin Add Event Form State
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newVenueIndex, setNewVenueIndex] = useState(0);
  const [newCategory, setNewCategory] = useState<CampusEventItem['category']>('Academic');
  const [newDescription, setNewDescription] = useState('');

  // Handle month changes
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Calendar matrix calculation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        monthOffset: -1,
        dateStr: '',
        hasHoliday: false,
        hasEvent: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      const dayEvents = events.filter((e) => e.date === dateStr);
      const hasHoliday = dayEvents.some((e) => e.category === 'Holiday' || e.category === 'Leave');
      const hasEvent = dayEvents.some((e) => e.category !== 'Holiday' && e.category !== 'Leave');

      days.push({
        day: d,
        monthOffset: 0,
        dateStr,
        hasHoliday,
        hasEvent,
      });
    }

    // Next month padding to make full grid
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        monthOffset: 1,
        dateStr: '',
        hasHoliday: false,
        hasEvent: false,
      });
    }

    return days;
  }, [year, month, events]);

  // Filtered list: either selected date, or all upcoming items sorted chronologically
  const filteredEvents = useMemo(() => {
    if (selectedDateStr) {
      return events.filter((e) => e.date === selectedDateStr);
    }
    // Return all events sorted by date
    return [...events].sort((a, b) => a.date.localeCompare(b.date));
  }, [events, selectedDateStr]);

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) return;

    const chosenVenue = VENUE_OPTIONS[newVenueIndex] || VENUE_OPTIONS[0];

    const newEvt: CampusEventItem = {
      id: `evt_${Date.now()}`,
      title: newTitle.trim(),
      date: newDate,
      time: newTime.trim() || (newCategory === 'Holiday' || newCategory === 'Leave' ? 'Full Day' : '10:00 AM - 04:00 PM'),
      venue: chosenVenue.name,
      venueNodeId: chosenVenue.nodeId,
      category: newCategory,
      description: newDescription.trim() || (newCategory === 'Holiday' ? 'College holiday.' : 'College campus event.'),
      addedByAdmin: true,
    };

    saveEvents([...events, newEvt]);
    if (isAdmin) {
      ApiService.saveEvent(newEvt).catch((err) => {
        console.warn('Failed to save event to API:', err);
      });
    }
    setShowAddForm(false);
    setNewTitle('');
    setNewDate('');
    setNewTime('');
    setNewDescription('');
  };

  const handleConfirmDeleteEvent = async () => {
    if (!eventToDelete) return;
    const targetId = eventToDelete.id;
    setIsDeletingEvent(true);
    try {
      if (isAdmin) {
        await ApiService.deleteEvent(targetId);
      }
      saveEvents(events.filter((e) => e.id !== targetId));
      setEventToDelete(null);
    } catch (err) {
      console.warn('Failed to delete event from API:', err);
      saveEvents(events.filter((e) => e.id !== targetId));
      setEventToDelete(null);
    } finally {
      setIsDeletingEvent(false);
    }
  };

  const handleGoToVenue360 = (nodeId: string) => {
    if (!nodeId) return;
    setActivePanoramaId(nodeId);
    setActiveTab('360_TOUR');
    onClose();
  };

  const getCategoryBadgeClass = (category: CampusEventItem['category']) => {
    switch (category) {
      case 'Holiday':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Leave':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Cultural':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Academic':
        return 'bg-blue-50 text-[#2563eb] border-blue-200';
      case 'Sports':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Seminar':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'General':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2563eb]">
              <CalendarIcon size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1e3a5f]">Campus Calendar & Holidays</h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Official holidays, leaves & schedule for Christ College
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors active:scale-95"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between px-2 bg-slate-50 py-2 rounded-2xl border border-slate-200/80">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-xl hover:bg-white text-slate-600 border border-transparent hover:border-slate-200 transition-all active:scale-95"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-black text-slate-800 tracking-wide">
              {monthNames[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-xl hover:bg-white text-slate-600 border border-transparent hover:border-slate-200 transition-all active:scale-95"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-xs">
            {/* Days of Week Header */}
            <div className="grid grid-cols-7 text-center text-[10px] font-extrabold text-slate-400 mb-2 uppercase tracking-wider">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((item, idx) => {
                if (item.monthOffset !== 0) {
                  return (
                    <div
                      key={idx}
                      className="h-9 flex items-center justify-center text-xs text-slate-300 font-medium"
                    >
                      {item.day}
                    </div>
                  );
                }

                const isSelected = selectedDateStr === item.dateStr;
                const isToday =
                  new Date().toISOString().split('T')[0] === item.dateStr;

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDateStr(null); // Deselect to show all
                      } else {
                        setSelectedDateStr(item.dateStr);
                      }
                    }}
                    className={`h-9 relative rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-500/30'
                        : isToday
                        ? 'bg-blue-50 text-[#2563eb] border border-blue-200'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{item.day}</span>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {item.hasHoliday && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-amber-300' : 'bg-emerald-500'
                          }`}
                        />
                      )}
                      {item.hasEvent && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-amber-300' : 'bg-blue-600'
                          }`}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-center gap-4 text-[10px] text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Holiday / Leave</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>College Event</span>
              </div>
            </div>
          </div>

          {/* Filter Status Bar */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-700">
              {selectedDateStr
                ? `Schedule for ${new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                : 'Upcoming Holidays & Schedule'}
            </h3>
            <div className="flex items-center gap-2">
              {selectedDateStr && (
                <button
                  onClick={() => setSelectedDateStr(null)}
                  className="text-[11px] font-bold text-[#2563eb] hover:underline"
                >
                  Show All
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#2563eb] text-[11px] font-bold rounded-lg border border-blue-200 transition-colors active:scale-95"
                >
                  <Plus size={13} />
                  <span>Add Event</span>
                </button>
              )}
            </div>
          </div>

          {/* Admin Add Event Form */}
          {isAdmin && showAddForm && (
            <form
              onSubmit={handleAddEvent}
              className="bg-slate-50 border border-blue-200 rounded-2xl p-3.5 space-y-3 animate-fade-in"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
                  <Sparkles size={13} />
                  <span>Add Official Event / Holiday</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Event / Holiday Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual College Day 2026"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Time (e.g. Full Day)
                  </label>
                  <input
                    type="text"
                    placeholder="Full Day or 10:00 AM - 04:00 PM"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Venue / Location
                  </label>
                  <select
                    value={newVenueIndex}
                    onChange={(e) => setNewVenueIndex(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    {VENUE_OPTIONS.map((v, i) => (
                      <option key={v.name} value={i}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Holiday">Official Holiday</option>
                    <option value="Leave">Institutional Leave</option>
                    <option value="Academic">Academic Event</option>
                    <option value="Cultural">Cultural</option>
                    <option value="Sports">Sports</option>
                    <option value="Seminar">Seminar / Workshop</option>
                    <option value="General">General Notice</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Official notice or details regarding this event / holiday..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-[#2563eb] hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
              >
                Save Event to Calendar
              </button>
            </form>
          )}

          {/* Events List / Empty State */}
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <CalendarIcon size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-600">No scheduled holidays or events</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Select another date or click &apos;Show All&apos;
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-blue-300 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getCategoryBadgeClass(evt.category)}`}>
                          {evt.category}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                          <Clock size={11} />
                          {evt.time}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">
                          {new Date(evt.date + 'T00:00:00').toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-800 tracking-tight leading-snug">
                        {evt.title}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-normal">
                        {evt.description}
                      </p>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => setEventToDelete(evt)}
                        className="text-slate-300 hover:text-rose-500 transition-colors p-1 rounded-lg cursor-pointer"
                        title="Remove event"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Venue & 360 Action or Holiday status banner */}
                  {evt.venueNodeId ? (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 truncate">
                        <MapPin size={13} className="text-[#2563eb] flex-shrink-0" />
                        <span className="truncate">{evt.venue}</span>
                      </div>

                      <button
                        onClick={() => evt.venueNodeId && handleGoToVenue360(evt.venueNodeId)}
                        className="px-3 py-1.5 bg-[#2563eb] hover:bg-blue-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xs transition-all active:scale-95 flex-shrink-0"
                      >
                        <Compass size={13} />
                        <span>Explore Venue (360°)</span>
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        <span>
                          {evt.category === 'Leave'
                            ? 'Institutional Vacation • Campus Recess'
                            : 'Official Holiday • Campus Closed'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">Christ College Calendar</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Event Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md p-6 bg-white border border-rose-200 rounded-3xl shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Confirm Event Deletion</h3>
                <p className="text-xs text-slate-500">Destructive removal</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-700">
              <p>Are you sure you want to permanently delete this event?</p>
              <p className="font-bold text-slate-900">&ldquo;{eventToDelete.title}&rdquo;</p>
              <p className="text-[11px] text-slate-500">Date: {eventToDelete.date} • Venue: {eventToDelete.venue}</p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setEventToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteEvent}
                disabled={isDeletingEvent}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5"
              >
                {isDeletingEvent ? <span>Deleting...</span> : <span>Confirm Delete</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
