import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(15);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Hold for 3 to 4 seconds with smooth progress stages
    const timer1 = setTimeout(() => setProgress(35), 500);
    const timer2 = setTimeout(() => setProgress(60), 1300);
    const timer3 = setTimeout(() => setProgress(82), 2100);
    const timer4 = setTimeout(() => setProgress(96), 2900);
    const timer5 = setTimeout(() => setProgress(100), 3300);

    const finishTimer = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(() => {
        onComplete();
      }, 400);
    }, 3500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
      clearTimeout(finishTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[99999] bg-slate-950 flex flex-col justify-between items-center text-center px-6 py-10 select-none transition-opacity duration-400 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(15, 23, 42, 0.75) 0%, rgba(15, 23, 42, 0.25) 35%, rgba(15, 23, 42, 0.35) 65%, rgba(15, 23, 42, 0.90) 100%), url('/assets/campus_splash_background.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Top Section: Official College Branding */}
      <div className="pt-8 sm:pt-10 flex flex-col items-center animate-fade-in">
        <div className="w-20 h-20 sm:w-24 sm:h-24 p-1 bg-white/95 backdrop-blur-md rounded-full shadow-2xl shadow-black/50 border-2 border-white mb-2.5 flex items-center justify-center overflow-hidden ring-4 ring-blue-500/30">
          <img
            src="/christ_college_official_logo.png"
            alt="Christ College Crest"
            className="w-full h-full object-contain rounded-full"
          />
        </div>
        <h1 className="text-base sm:text-lg font-black tracking-wider text-white uppercase leading-tight max-w-xs drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
          Christ College
        </h1>
        <p className="text-[11px] sm:text-xs font-bold tracking-widest text-sky-300 uppercase mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
          (Autonomous) Irinjalakuda
        </p>
        <p className="text-base sm:text-lg font-serif italic text-white/95 mt-2.5 font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
          A Smarter Campus, A Brighter You
        </p>
      </div>

      {/* Bottom Section: WayCampus Branding & Progress */}
      <div className="w-full max-w-xs flex flex-col items-center pb-8 animate-slide-up">
        <div className="mb-4">
          <h2 className="text-3xl sm:text-4xl tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
            <span className="font-extrabold text-white">Way</span>
            <span className="font-light text-sky-300">Campus</span>
          </h2>
          <p className="text-xs sm:text-sm font-medium tracking-widest text-slate-200 uppercase mt-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
            Navigate · Explore · Belong
          </p>
        </div>

        {/* Progress bar matching template */}
        <div className="w-full bg-white/20 backdrop-blur-md rounded-full h-2.5 overflow-hidden p-0.5 shadow-inner border border-white/20">
          <div
            className="bg-gradient-to-r from-sky-400 to-blue-600 h-full rounded-full transition-all duration-300 ease-out shadow-sm shadow-blue-500/50"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between items-center w-full mt-2 text-[11px] text-slate-200 font-semibold px-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          <span>Loading your campus...</span>
          <span className="font-mono">{progress}%</span>
        </div>
      </div>
    </div>
  );
};
