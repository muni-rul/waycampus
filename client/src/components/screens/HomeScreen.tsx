import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  QrCode,
  User,
  Building2,
  UtensilsCrossed,
  BookOpen,
  Users2,
  MapPin,
  ChevronRight,
  Compass,
  Calendar,
  Sparkles,
  ArrowRight,
  RotateCw,
  Mic,
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';
import { EventCalendarModal } from '../ui/EventCalendarModal';
import { getNearestLocationDescriptor } from '../../services/locationNameResolver';

interface HomeScreenProps {
  onOpenSearch: (category?: string) => void;
}

const SLIDESHOW_IMAGES = [
  {
    url: '/assets/campus_aerial_master_2026.jpg',
    title: 'Welcome to Christ College',
    subtitle: 'Find your way, every day',
    tag: 'Official Smart Wayfinder',
  },
  {
    url: '/assets/campus_slideshow_1.jpg',
    title: 'Historic Main Campus',
    subtitle: 'Excellence in education since 1956',
    tag: 'Autonomous • Irinjalakuda',
  },
  {
    url: '/assets/campus_slideshow_2.jpg',
    title: 'Central Green Quadrangle',
    subtitle: 'Eco-friendly sustainable campus',
    tag: 'Heritage Campus Gardens',
  },
  {
    url: '/assets/campus_slideshow_3.jpg',
    title: 'Student Quadrangle & Gardens',
    subtitle: 'Vibrant cultural and student life',
    tag: 'Student Quadrangle',
  },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({ onOpenSearch }) => {
  const {
    setActivePanoramaId,
    setActiveTab,
    setIsQRScannerOpen,
    setIsWhereAmIOpen,
    setIsMoreMenuOpen,
    userLocationLabel,
    activePanorama,
    activePanoramaId,
  } = useNavigation();

  const currentLocationDesc = useMemo(() => {
    return getNearestLocationDescriptor(activePanorama?.id || activePanoramaId);
  }, [activePanorama?.id, activePanoramaId]);

  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [isEventCalendarOpen, setIsEventCalendarOpen] = useState(false);

  // Slideshow state with 4-5s automatic randomized transition
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => {
        let next = Math.floor(Math.random() * SLIDESHOW_IMAGES.length);
        if (next === prev) {
          next = (prev + 1) % SLIDESHOW_IMAGES.length;
        }
        return next;
      });
    }, 4500); // 4.5 seconds
    return () => clearInterval(timer);
  }, []);

  // Filter Categories (Hostels removed; properly mapped categories)
  const categories = [
    { id: 'ALL', label: 'All' },
    { id: 'ACADEMIC', label: 'Academic' },
    { id: 'FACILITIES', label: 'Facilities' },
    { id: 'ROOMS', label: 'Classrooms' },
    { id: 'FACULTY', label: 'Faculty' },
    { id: 'BUILDINGS', label: 'Buildings' },
    { id: 'MORE', label: '··· More' },
  ];

  const handleQuickAccess = (id: string) => {
    switch (id) {
      case 'buildings':
        onOpenSearch('BUILDINGS');
        break;
      case 'library':
        // Verified Central Library node outdoor_201
        setActivePanoramaId('outdoor_201');
        setActiveTab('360_TOUR');
        break;
      default:
        onOpenSearch();
        break;
    }
  };

  const handleFeatured = (id: string) => {
    switch (id) {
      case 'tour':
        setActivePanoramaId(activePanoramaId || 'outdoor_001');
        setActiveTab('360_TOUR');
        break;
      case 'events':
        setIsEventCalendarOpen(true);
        break;
    }
  };

  return (
    <div
      className="flex-1 min-h-0 h-full overflow-y-auto overscroll-y-contain bg-slate-50 text-slate-800 pb-36 touch-pan-y"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Top Header Bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 pt-safe pb-2.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 p-0.5 bg-white rounded-full shadow-sm border border-slate-200/90 flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-blue-500/20">
            <img
              src="/christ_college_official_logo.png"
              alt="Christ College (Autonomous) Irinjalakuda"
              className="w-full h-full object-contain rounded-full"
            />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-black tracking-wider text-[#1e3a5f] uppercase leading-tight">
              Christ College
            </h1>
            <p className="text-[10px] font-bold text-[#2563eb] tracking-wide uppercase">
              (Autonomous) Irinjalakuda
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsMoreMenuOpen(true)}
          className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-600 transition-colors active:scale-95"
          title="Account & More Options"
        >
          <User size={18} />
        </button>
      </header>

      <div className="px-4 pt-3 space-y-4 max-w-lg mx-auto">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div
            onClick={() => onOpenSearch()}
            className="flex-1 flex items-center justify-between gap-2.5 bg-white border border-slate-200/90 rounded-2xl px-3.5 py-3 shadow-xs hover:border-blue-400 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Search size={18} className="text-slate-400 flex-shrink-0 group-hover:text-blue-500 transition-colors" />
              <span className="text-xs sm:text-sm text-slate-400 font-normal truncate">
                Search buildings, rooms, faculty...
              </span>
            </div>
            <div className="w-7 h-7 rounded-full bg-slate-100 hover:bg-blue-50 text-[#2563eb] flex items-center justify-center flex-shrink-0 transition-colors">
              <Mic size={14} />
            </div>
          </div>

          <button
            onClick={() => setIsQRScannerOpen(true)}
            className="w-11 h-11 bg-white border border-slate-200/90 hover:border-blue-400 rounded-2xl flex items-center justify-center text-[#2563eb] shadow-xs active:scale-95 transition-all flex-shrink-0"
            title="Scan Campus Door QR"
          >
            <QrCode size={20} />
          </button>
        </div>

        {/* Category Pills (Filters work properly) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 overscroll-x-contain touch-pan-x">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  if (cat.id === 'MORE') {
                    setIsMoreMenuOpen(true);
                  } else if (cat.id !== 'ALL') {
                    onOpenSearch(cat.id);
                  } else {
                    onOpenSearch('ALL');
                  }
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
                  isActive
                    ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-500/25'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Hero Slideshow Banner (4-5s randomized transition with 4 images) */}
        <div className="relative rounded-3xl overflow-hidden shadow-md text-white p-5 sm:p-6 min-h-[170px] sm:min-h-[185px] flex flex-col justify-between">
          {/* Stacked Slideshow Images with Smooth Crossfade */}
          {SLIDESHOW_IMAGES.map((slide, index) => {
            const isVisible = index === currentSlide;
            return (
              <div
                key={slide.url}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  isVisible ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'
                }`}
                style={{
                  backgroundImage: `linear-gradient(to right, rgba(15, 23, 42, 0.90) 0%, rgba(15, 23, 42, 0.60) 65%, rgba(15, 23, 42, 0.30) 100%), url('${slide.url}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            );
          })}

          {/* Banner Text Content */}
          <div className="relative z-10 max-w-[78%]">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/30 border border-blue-400/40 rounded-full text-[10px] font-semibold text-blue-200 mb-2">
              <Sparkles size={11} />
              <span>{SLIDESHOW_IMAGES[currentSlide]?.tag || 'Official Smart Wayfinder'}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-snug drop-shadow-sm transition-all">
              {SLIDESHOW_IMAGES[currentSlide]?.title}
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 mt-1 font-medium drop-shadow-xs">
              {SLIDESHOW_IMAGES[currentSlide]?.subtitle}
            </p>
          </div>

          {/* Banner Footer Controls & Interactive Dots */}
          <div className="relative z-10 flex items-center justify-between mt-4">
            {/* Interactive Dots for 4 Slides */}
            <div className="flex items-center gap-1.5">
              {SLIDESHOW_IMAGES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentSlide
                      ? 'w-6 bg-white shadow-xs'
                      : 'w-1.5 bg-white/40 hover:bg-white/70'
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>

            {/* Quick 360 Tour CTA Button */}
            <button
              onClick={() => {
                setActivePanoramaId(activePanoramaId || 'outdoor_001');
                setActiveTab('360_TOUR');
              }}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 backdrop-blur-xs border border-white/30 rounded-xl text-[11px] font-bold flex items-center gap-1 text-white shadow-xs transition-all active:scale-95"
            >
              <span>Explore 360°</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* Quick Access Section (Hostels removed; clean 4-column layout) */}
        <div>
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <h3 className="text-xs sm:text-sm font-bold text-[#1e3a5f]">Quick Access</h3>
            <button
              onClick={() => onOpenSearch('BUILDINGS')}
              className="text-[11px] font-bold text-[#2563eb] hover:underline"
            >
              See All
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {/* Buildings */}
            <button
              onClick={() => handleQuickAccess('buildings')}
              className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-all active:scale-95 group"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2563eb] group-hover:scale-105 transition-transform">
                <Building2 size={20} />
              </div>
              <span className="text-[11px] font-bold text-slate-700 truncate w-full text-center">
                Buildings
              </span>
            </button>

            {/* Library */}
            <button
              onClick={() => handleQuickAccess('library')}
              className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-all active:scale-95 group"
            >
              <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-transform">
                <BookOpen size={20} />
              </div>
              <span className="text-[11px] font-bold text-slate-700 truncate w-full text-center">
                Library
              </span>
            </button>

            {/* Canteen */}
            <button
              onClick={() => {
                setActivePanoramaId('outdoor_155');
                setActiveTab('360_TOUR');
              }}
              className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-all active:scale-95 group"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
                <UtensilsCrossed size={20} />
              </div>
              <span className="text-[11px] font-bold text-slate-700 truncate w-full text-center">
                Canteen
              </span>
            </button>

            {/* 360 Tour */}
            <button
              onClick={() => handleFeatured('tour')}
              className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-sm transition-all active:scale-95 group"
            >
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform">
                <RotateCw size={20} />
              </div>
              <span className="text-[11px] font-bold text-slate-700 truncate w-full text-center">
                360° Tour
              </span>
            </button>
          </div>
        </div>

        {/* You Are Here Card */}
        <div
          onClick={() => setIsWhereAmIOpen(true)}
          className="flex items-center justify-between p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs hover:border-blue-400 transition-all cursor-pointer active:scale-98 group"
          title="Click to view full location info"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white flex-shrink-0 shadow-sm shadow-blue-500/30 group-hover:scale-105 transition-transform">
              <MapPin size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#2563eb] block">
                You are here
              </span>
              <p className="text-xs font-black text-slate-800 truncate">
                {currentLocationDesc.title}
              </p>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                {currentLocationDesc.subtitle || userLocationLabel || 'Christ College Campus'}
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-400 flex-shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform" />
        </div>

        {/* Featured Horizontal Cards */}
        <div>
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <h3 className="text-xs sm:text-sm font-bold text-[#1e3a5f]">Featured</h3>
            <button
              onClick={() => {
                setActivePanoramaId(activePanoramaId || 'outdoor_001');
                setActiveTab('360_TOUR');
              }}
              className="text-[11px] font-bold text-[#2563eb] hover:underline"
            >
              See All
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* 360° Tour */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleFeatured('tour')}
              onKeyDown={(e) => e.key === 'Enter' && handleFeatured('tour')}
              className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-pointer active:scale-95 group"
            >
              <div className="h-24 sm:h-28 bg-sky-100 relative overflow-hidden">
                <img
                  src="/assets/campus_slideshow_1.jpg"
                  alt="360 Tour"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-blue-950/25 flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-[#2563eb] shadow-sm">
                    <Compass size={18} />
                  </div>
                </div>
              </div>
              <div className="p-3 text-center">
                <h4 className="text-xs sm:text-sm font-bold text-slate-800">360° Virtual Tour</h4>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">Explore the complete campus</p>
              </div>
            </div>

            {/* Events */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleFeatured('events')}
              onKeyDown={(e) => e.key === 'Enter' && handleFeatured('events')}
              className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-pointer active:scale-95 group"
            >
              <div className="h-20 sm:h-24 bg-emerald-50 relative overflow-hidden">
                <img
                  src="/assets/campus_slideshow_3.jpg"
                  alt="Auditorium & Events"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-emerald-950/25 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-emerald-600 shadow-sm">
                    <Calendar size={16} />
                  </div>
                </div>
              </div>
              <div className="p-2.5 text-center">
                <h4 className="text-xs font-bold text-slate-800">Campus Calendar</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Holidays & events</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Campus Events Calendar Modal */}
      <EventCalendarModal
        isOpen={isEventCalendarOpen}
        onClose={() => setIsEventCalendarOpen(false)}
        isAdmin={false}
      />
    </div>
  );
};
