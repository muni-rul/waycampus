import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, WifiOff, Share, PlusSquare } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIosPrompt, setIsIosPrompt] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    // 1. Online / Offline state tracking
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 2. Check if already installed or in standalone display mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      return;
    }

    // 3. Check dismissal expiry (don't nag if dismissed within last 3 days)
    const dismissedAt = localStorage.getItem('campnav_pwa_dismissed');
    if (dismissedAt) {
      const daysAgo = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysAgo < 3) return;
    }

    // 4. iOS Safari Detection
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIos) {
      setIsIosPrompt(true);
      setIsVisible(true);
      return;
    }

    // 5. Capture native beforeinstallprompt event for Android/Chrome/Edge
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setIsVisible(false);
      }
    } catch (err) {
      console.warn('PWA install prompt failed:', err);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('campnav_pwa_dismissed', Date.now().toString());
  };

  return (
    <>
      {/* Offline Status Badge */}
      {isOffline && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-amber-950/90 border border-amber-500/40 text-amber-300 text-xs font-bold py-1.5 px-3.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-bounce">
          <WifiOff size={13} className="text-amber-400" />
          <span>Offline Mode Active • Using Cached Panoramas</span>
        </div>
      )}

      {/* Install PWA Prompt Banner (Android / Chrome / Edge) */}
      {isVisible && !isIosPrompt && (
        <div className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm z-50 animate-slide-up">
          <div className="bg-slate-900/95 border border-sky-500/40 rounded-3xl p-4 shadow-2xl backdrop-blur-xl flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-sky-500/25">
              <Smartphone size={24} />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-white font-extrabold text-xs sm:text-sm leading-tight truncate">
                Install CampNav App
              </h4>
              <p className="text-slate-300 text-[11px] leading-snug mt-0.5">
                Faster loading & full offline 360° navigation without internet.
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleInstallClick}
                className="py-2 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-xs shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Safari "Add to Home Screen" Instructions */}
      {isVisible && isIosPrompt && (
        <div className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm z-50 animate-slide-up">
          <div className="bg-slate-900/95 border border-emerald-500/40 rounded-3xl p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-emerald-500/25">
                  <Smartphone size={20} />
                </div>
                <div>
                  <h4 className="text-white font-extrabold text-xs sm:text-sm">Install on iPhone / iPad</h4>
                  <p className="text-slate-400 text-[10px]">Use offline anytime from your home screen</p>
                </div>
              </div>
              <button onClick={handleDismiss} className="text-slate-400 hover:text-white p-1">
                <X size={16} />
              </button>
            </div>
            <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/70 border border-white/5 text-[11px] text-slate-300 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-sky-400">1</span>
                <span>Tap Safari's <strong className="text-white">Share</strong> button <Share size={12} className="inline text-sky-400 mx-0.5" /> below</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-sky-400">2</span>
                <span>Select <strong className="text-white">Add to Home Screen</strong> <PlusSquare size={12} className="inline text-emerald-400 mx-0.5" /></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
