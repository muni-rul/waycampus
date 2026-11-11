import React from 'react';
import { Home, RotateCw, MoreHorizontal } from 'lucide-react';
import { useNavigation, WayCampusTab } from '../../context/NavigationContext';

export const BottomBar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isNavigating,
    setIsMoreMenuOpen,
  } = useNavigation();

  // In active navigation or 360° virtual tour, bottom bar is hidden so users can see all floor arrows & panoramas
  if (isNavigating || activeTab === '360_TOUR') return null;

  const tabs: {
    id: WayCampusTab;
    label: string;
    icon: React.ReactNode;
    isPrimary?: boolean;
  }[] = [
    {
      id: 'HOME',
      label: 'Home',
      icon: <Home size={20} />,
    },
    {
      id: '360_TOUR',
      label: '360° Tour',
      icon: <RotateCw size={21} />,
      isPrimary: true,
    },
    {
      id: 'MORE',
      label: 'More',
      icon: <MoreHorizontal size={22} />,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 px-3 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] select-none">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          if (tab.isPrimary) {
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1 rounded-2xl transition-all active:scale-95 ${
                  isActive
                    ? 'bg-blue-50 text-[#2563eb] font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title={tab.label}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-[#2563eb] text-white shadow-md shadow-blue-500/30'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.icon}
                </div>
                <span className="text-[10px] tracking-tight font-semibold whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'MORE') {
                  setIsMoreMenuOpen(true);
                } else {
                  setActiveTab(tab.id);
                }
              }}
              className={`flex flex-col items-center justify-center gap-1 py-1 px-3 min-w-[64px] rounded-xl transition-all active:scale-95 ${
                isActive
                  ? 'text-[#2563eb] font-bold'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title={tab.label}
            >
              <div className="relative">
                {tab.icon}
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#2563eb] rounded-full" />
                )}
              </div>
              <span className="text-[10px] tracking-tight font-medium whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
