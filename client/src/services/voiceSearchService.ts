/**
 * voiceSearchService.ts
 * Web Speech Recognition & Natural Language Campus Query Parser.
 * Provides voice-to-text search compatible with Chrome, Edge, Safari, and Android browsers.
 */

// Natural language filler prefixes to remove from spoken queries
const SPEECH_PREFIX_REGEX =
  /^(take me to|navigate to|go to|where is the|where is|search for|search|find the|find|show me the|show me|directions to|how to go to|how to reach|lead me to|bring me to)\s+/i;

// Spoken acronyms and colloquial phrases mapping to official campus terms
const SPOKEN_PHRASE_MAPPINGS: Array<[RegExp, string]> = [
  [/\bs\s*b\s*block\b/gi, 'Sneha Bhavan Block'],
  [/\bg\s*b\s*block\b/gi, 'Gabriel Block'],
  [/\bm\s*g\s*block\b/gi, 'MG Block'],
  [/\bs\s*j\s*block\b/gi, 'SJ Block'],
  [/\bs\s*c\s*block\b/gi, 'SC Block'],
  [/\bs\s*m\s*block\b/gi, 'SM Block'],
  [/\bm\s*t\s*block\b/gi, 'MT Block'],
  [/\bl\s*f\s*block\b/gi, 'Little Flower Block'],
  [/\ba\s*b\s*block\b/gi, 'Admin Block'],
  [/\bb\s*b\s*a\s*block\b/gi, 'BBA Block'],
  [/\bb\s*c\s*a\s*lab\b/gi, 'BCA Lab'],
  [/\bm\s*s\s*w\b/gi, 'MSW'],
  [/\bb\s*s\s*w\b/gi, 'BSW'],
  [/\bb\s*v\s*o\s*c\b/gi, 'B.Voc'],
  [/\bh\s*o\s*d\b/gi, 'HOD'],
  [/\bfather\s+gabriel\b/gi, 'Fr. Gabriel'],
  [/\bfr\s+gabriel\b/gi, 'Fr. Gabriel'],
  [/\bmother\s+teresa\b/gi, 'Mother Theresa'],
  [/\bmother\s+theresa\b/gi, 'Mother Theresa'],
  [/\bsaint\s+chavara\b/gi, 'St. Chavara'],
  [/\bst\s+chavara\b/gi, 'St. Chavara'],
  [/\bsaint\s+marys?\b/gi, "St. Mary's"],
  [/\bst\s+marys?\b/gi, "St. Mary's"],
  [/\bsaint\s+josephs?\b/gi, "St. Joseph's"],
  [/\bst\s+josephs?\b/gi, "St. Joseph's"],
  [/\bsaint\s+sebastian\b/gi, 'St. Sebastian'],
  [/\bst\s+sebastian\b/gi, 'St. Sebastian'],
  [/\bsnehabhavan\b/gi, 'Sneha Bhavan'],
  [/\blittle\s+flower\b/gi, 'Little Flower'],
  [/\bhotel\s+management\b/gi, 'Hotel Management'],
  [/\bcomputer\s+science\b/gi, 'Computer Science'],
  [/\bchemistry\s+lab\b/gi, 'Chemistry Lab'],
  [/\bphysics\s+lab\b/gi, 'Physics Lab'],
  [/\bzoology\s+lab\b/gi, 'Zoology Lab'],
  [/\bbotany\s+lab\b/gi, 'Botany Lab'],
  [/\bprincipal\s+office\b/gi, 'Principal Office'],
  [/\bvice\s+principal\b/gi, 'Vice Principal'],
  [/\bcontroller\s+of\s+examinations?\b/gi, 'Exam Directorate'],
  [/\bpareeksha\s+bhavan\b/gi, 'Pareeksha Bhavan'],
  [/\bcentral\s+library\b/gi, 'Library'],
  [/\bmain\s+canteen\b/gi, 'Canteen'],
  [/\bgirls\s+hostel\b/gi, "Girls' Hostel"],
  [/\bboys\s+hostel\b/gi, "Boys' Hostel"],
  [/\bmain\s+entrance\b/gi, 'Main Gate'],
  [/\bmain\s+gate\b/gi, 'Main Gate'],
];

/**
 * Cleans and formats spoken input into an optimized campus search query.
 */
export function cleanSpokenQuery(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText.trim();

  // Strip navigation commands like "take me to", "where is", "find"
  cleaned = cleaned.replace(SPEECH_PREFIX_REGEX, '').trim();

  // Apply campus phrase mappings
  for (const [pattern, replacement] of SPOKEN_PHRASE_MAPPINGS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned.trim();
}

/**
 * Checks if the browser supports the Web Speech Recognition API.
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

export interface VoiceSearchCallbacks {
  onStart?: () => void;
  onInterim?: (interimText: string) => void;
  onResult: (finalText: string) => void;
  onError?: (errorMessage: string, isPermissionError: boolean) => void;
  onEnd?: () => void;
}

export class VoiceSearchController {
  private recognition: any = null;
  private isListening = false;

  constructor() {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      try {
        this.recognition = new SpeechRecognitionClass();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        // Default to Indian English, with browser language fallback
        this.recognition.lang = navigator.language || 'en-IN';
      } catch (err) {
        console.warn('[VoiceSearch] Initialization failed', err);
      }
    }
  }

  public isAvailable(): boolean {
    return this.recognition !== null;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public start(callbacks: VoiceSearchCallbacks): boolean {
    if (!this.recognition) {
      callbacks.onError?.('Voice search is not supported in this browser.', false);
      return false;
    }

    if (this.isListening) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore
      }
    }

    this.isListening = true;
    let finalTranscript = '';

    this.recognition.onstart = () => {
      this.isListening = true;
      callbacks.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        callbacks.onInterim?.(interim);
      }

      if (finalTranscript) {
        const cleaned = cleanSpokenQuery(finalTranscript);
        callbacks.onResult(cleaned || finalTranscript.trim());
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      const errorType = event.error;
      let userMsg = 'Unable to recognize speech. Please try again.';
      let isPermission = false;

      switch (errorType) {
        case 'not-allowed':
        case 'service-not-allowed':
          userMsg = 'Microphone access was denied. Please allow microphone permissions.';
          isPermission = true;
          break;
        case 'no-speech':
          userMsg = "Didn't catch that. Please speak clearly into your mic.";
          break;
        case 'audio-capture':
          userMsg = 'No microphone was detected on your device.';
          break;
        case 'network':
          userMsg = 'Network error during voice recognition. Check your connection.';
          break;
        case 'aborted':
          return; // Ignore manual stops
        default:
          userMsg = `Voice recognition error (${errorType}). Please try again.`;
      }

      callbacks.onError?.(userMsg, isPermission);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      callbacks.onEnd?.();
    };

    try {
      this.recognition.start();
      return true;
    } catch (err) {
      this.isListening = false;
      console.warn('[VoiceSearch] Start failed', err);
      callbacks.onError?.('Could not start microphone. Please try again.', false);
      return false;
    }
  }

  public stop(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.isListening = false;
    }
  }

  public abort(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.isListening = false;
    }
  }
}

// Export singleton instance
export const voiceSearch = new VoiceSearchController();
