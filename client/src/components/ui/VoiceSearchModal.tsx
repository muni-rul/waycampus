import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, X, AlertCircle, Sparkles, Volume2, ArrowRight } from 'lucide-react';
import { voiceSearch, isSpeechRecognitionSupported } from '../../services/voiceSearchService';

export interface VoiceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscript: (query: string) => void;
  contextHint?: string;
}

const VOICE_SEARCH_SUGGESTIONS = [
  'Sneha Bhavan Block',
  'Library',
  'MG Block Room 102',
  'Fr. Gabriel Indoor Stadium',
  'Chemistry Lab',
  'Principal Office',
  'St. Chavara Block',
  'College Canteen',
  'Mother Theresa Block',
];

export const VoiceSearchModal: React.FC<VoiceSearchModalProps> = ({
  isOpen,
  onClose,
  onTranscript,
  contextHint = 'Christ College Irinjalakuda',
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const hasSpokenRef = useRef(false);

  const startListening = useCallback(() => {
    setErrorMessage(null);
    setIsPermissionError(false);
    setTranscript('');
    setInterimText('');
    hasSpokenRef.current = false;

    if (!isSpeechRecognitionSupported()) {
      setErrorMessage(
        'Voice search is not supported in this browser. Please use Chrome, Edge, or Safari.'
      );
      return;
    }

    voiceSearch.start({
      onStart: () => {
        setIsListening(true);
      },
      onInterim: (text) => {
        hasSpokenRef.current = true;
        setInterimText(text);
      },
      onResult: (finalQuery) => {
        hasSpokenRef.current = true;
        setTranscript(finalQuery);
        setIsListening(false);
        // Small delay so the user sees their spoken words before search executes
        setTimeout(() => {
          onTranscript(finalQuery);
          onClose();
        }, 550);
      },
      onError: (msg, isPerm) => {
        setIsListening(false);
        setErrorMessage(msg);
        setIsPermissionError(isPerm);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  }, [onTranscript, onClose]);

  useEffect(() => {
    if (isOpen) {
      startListening();
    } else {
      voiceSearch.stop();
      setIsListening(false);
      setTranscript('');
      setInterimText('');
      setErrorMessage(null);
    }

    return () => {
      voiceSearch.abort();
    };
  }, [isOpen, startListening]);

  if (!isOpen) return null;

  const currentDisplayText = transcript || interimText;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          voiceSearch.stop();
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-search-title"
      >
        {/* Close Button */}
        <button
          onClick={() => {
            voiceSearch.stop();
            onClose();
          }}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors"
          title="Close voice search"
        >
          <X size={18} />
        </button>

        {/* Title / Context */}
        <div className="flex items-center gap-2 mb-1 text-xs font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
          <Sparkles size={14} className="animate-pulse" />
          <span id="voice-search-title">Voice Search</span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-6 font-medium">
          {contextHint}
        </p>

        {/* Animated Central Microphone Button with Waveform Ripples */}
        <div className="relative my-4 flex items-center justify-center">
          {/* Animated Glowing Wave Rings */}
          {isListening && (
            <>
              <div className="absolute w-28 h-28 rounded-full bg-blue-500/20 animate-ping duration-1000" />
              <div className="absolute w-36 h-36 rounded-full bg-blue-500/10 animate-pulse duration-700" />
            </>
          )}

          <button
            onClick={() => {
              if (isListening) {
                voiceSearch.stop();
                setIsListening(false);
              } else {
                startListening();
              }
            }}
            className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-95 ${
              isListening
                ? 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 text-white shadow-blue-500/40 ring-4 ring-blue-300 dark:ring-blue-800 animate-pulse'
                : errorMessage
                ? 'bg-rose-500 text-white shadow-rose-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title={isListening ? 'Listening... Tap to stop' : 'Tap to start speaking'}
          >
            {isListening ? (
              <Mic size={36} className="animate-bounce-subtle" />
            ) : errorMessage ? (
              <MicOff size={32} />
            ) : (
              <Mic size={32} />
            )}
          </button>
        </div>

        {/* Audio Waveform Bars (When Listening) */}
        {isListening && (
          <div className="flex items-center justify-center gap-1.5 h-6 my-3">
            {[14, 22, 12, 28, 16, 24, 18, 10].map((h, i) => (
              <span
                key={i}
                className="w-1 bg-gradient-to-t from-blue-600 to-sky-400 rounded-full animate-pulse"
                style={{
                  height: `${h}px`,
                  animationDuration: `${0.4 + (i % 4) * 0.15}s`,
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Status / Speech Output Box */}
        <div className="min-h-[64px] flex flex-col items-center justify-center my-2 max-w-sm w-full px-2">
          {errorMessage ? (
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-semibold">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : currentDisplayText ? (
            <div className="space-y-1">
              <p className="text-base sm:text-lg font-black text-slate-800 dark:text-white line-clamp-2">
                "{currentDisplayText}"
              </p>
              {transcript && (
                <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                  <span>Searching campus...</span>
                  <ArrowRight size={12} className="animate-pulse" />
                </p>
              )}
            </div>
          ) : isListening ? (
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 animate-pulse">
              Listening... Say any building, room or teacher name
            </p>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Tap the microphone to speak
            </p>
          )}
        </div>

        {/* Action Button on Error */}
        {errorMessage && (
          <button
            onClick={startListening}
            className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5"
          >
            <Mic size={14} />
            <span>Try Again</span>
          </button>
        )}

        {/* Example Prompt Chips */}
        <div className="mt-5 w-full pt-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mb-2.5 flex items-center justify-center gap-1">
            <Volume2 size={12} />
            <span>Try saying:</span>
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 max-h-24 overflow-y-auto no-scrollbar">
            {VOICE_SEARCH_SUGGESTIONS.slice(0, 6).map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  voiceSearch.stop();
                  onTranscript(suggestion);
                  onClose();
                }}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all active:scale-95"
              >
                "{suggestion}"
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
