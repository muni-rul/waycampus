/**
 * voiceNavigationService.ts — Natural Human Voice Guidance Engine
 * WayCampus / Christ College CampusNav
 *
 * Strictly speaks verified walking directions matching visual arrows:
 * - "Continue straight."
 * - "Turn left."
 * - "Turn right."
 * - "Turn slightly left."
 * - "Turn slightly right."
 * - "Go upstairs."
 * - "Go downstairs."
 * - "Enter the building."
 * - "Exit the building."
 * - "You have arrived at [destination]."
 *
 * CRITICAL RULE: NEVER speak panorama IDs, node numbers, or database keys.
 */

import { NavigationStep } from './campusPathfinder';

export type VoiceDirection =
  | 'STRAIGHT'
  | 'LEFT'
  | 'RIGHT'
  | 'SLIGHT_LEFT'
  | 'SLIGHT_RIGHT'
  | 'STAIRS_UP'
  | 'STAIRS_DOWN'
  | 'RAMP_UP'
  | 'RAMP_DOWN'
  | 'ENTER_BUILDING'
  | 'EXIT_BUILDING'
  | 'U_TURN'
  | 'ARRIVAL'
  | 'UNKNOWN'
  | 'DIRECTION_UNVERIFIED';

export interface VoiceDirectionResolution {
  direction: VoiceDirection;
  phrase: string;
  isVerified: boolean;
  debugNotice?: string;
}

/**
 * Returns canonical human voice guidance phrase for any supported direction.
 * ZERO node numbers, IDs, or database keys.
 */
export function getVoicePhraseForDirection(rawDirection?: string, destinationTitle?: string): string {
  const dir = (rawDirection || '').toLowerCase().trim();
  switch (dir) {
    case 'straight':
    case 'forward':
      return 'Continue straight.';
    case 'left':
      return 'Turn left.';
    case 'right':
      return 'Turn right.';
    case 'slight-left':
    case 'slight_left':
      return 'Turn slightly left.';
    case 'slight-right':
    case 'slight_right':
      return 'Turn slightly right.';
    case 'stairs-up':
    case 'stairs_up':
      return 'Go upstairs.';
    case 'stairs-down':
    case 'stairs_down':
      return 'Go downstairs.';
    case 'ramp-up':
    case 'ramp_up':
      return 'Go up the ramp.';
    case 'ramp-down':
    case 'ramp_down':
      return 'Go down the ramp.';
    case 'enter-building':
    case 'enter_building':
      return 'Enter the building.';
    case 'exit-building':
    case 'exit_building':
      return 'Exit the building.';
    case 'u-turn':
    case 'u_turn':
    case 'turn-back':
    case 'turn_back':
      return 'Turn back.';
    case 'arrival':
    case 'arrive':
      return destinationTitle?.trim() ? `You have arrived at ${destinationTitle.trim()}.` : 'You have arrived at your destination.';
    case 'unknown':
    default:
      return '';
  }
}

/**
 * Authoritative direction-to-voice mapper.
 * Uses ONLY the verified navigation connection / arrow direction metadata.
 * NEVER guesses from node IDs, photo numbers, or image appearance.
 */
export function resolveVoiceDirection(
  step?: NavigationStep | null,
  destinationTitle?: string,
  options?: { isFaculty?: boolean; departmentName?: string }
): VoiceDirectionResolution {
  if (!step) {
    return {
      direction: 'DIRECTION_UNVERIFIED',
      phrase: '',
      isVerified: false,
      debugNotice: 'Direction requires manual verification.',
    };
  }

  // 1. Destination Arrival Check
  if (step.isDestination || step.actionType === 'ARRIVE' || !step.targetNodeId) {
    const targetName = (options?.isFaculty && options?.departmentName?.trim())
      ? options.departmentName.trim()
      : destinationTitle?.trim();
    const cleanDest = targetName;
    return {
      direction: 'ARRIVAL',
      phrase: cleanDest ? `You have arrived at ${cleanDest}.` : 'You have arrived at your destination.',
      isVerified: true,
    };
  }

  // 2. Verified Connection Direction Mapping
  const rawDir = (step.direction || '').toLowerCase().trim();

  switch (rawDir) {
    case 'straight':
    case 'forward':
      return {
        direction: 'STRAIGHT',
        phrase: 'Continue straight.',
        isVerified: true,
      };

    case 'left':
      return {
        direction: 'LEFT',
        phrase: 'Turn left.',
        isVerified: true,
      };

    case 'right':
      return {
        direction: 'RIGHT',
        phrase: 'Turn right.',
        isVerified: true,
      };

    case 'slight-left':
    case 'slight_left':
      return {
        direction: 'SLIGHT_LEFT',
        phrase: 'Turn slightly left.',
        isVerified: true,
      };

    case 'slight-right':
    case 'slight_right':
      return {
        direction: 'SLIGHT_RIGHT',
        phrase: 'Turn slightly right.',
        isVerified: true,
      };

    case 'stairs-up':
    case 'stairs_up':
      return {
        direction: 'STAIRS_UP',
        phrase: 'Go upstairs.',
        isVerified: true,
      };

    case 'stairs-down':
    case 'stairs_down':
      return {
        direction: 'STAIRS_DOWN',
        phrase: 'Go downstairs.',
        isVerified: true,
      };

    case 'ramp-up':
    case 'ramp_up':
      return {
        direction: 'RAMP_UP',
        phrase: 'Go up the ramp.',
        isVerified: true,
      };

    case 'ramp-down':
    case 'ramp_down':
      return {
        direction: 'RAMP_DOWN',
        phrase: 'Go down the ramp.',
        isVerified: true,
      };

    case 'enter-building':
    case 'enter_building':
      return {
        direction: 'ENTER_BUILDING',
        phrase: 'Enter the building.',
        isVerified: true,
      };

    case 'exit-building':
    case 'exit_building':
      return {
        direction: 'EXIT_BUILDING',
        phrase: 'Exit the building.',
        isVerified: true,
      };

    case 'u-turn':
    case 'u_turn':
    case 'turn-back':
    case 'turn_back':
      return {
        direction: 'U_TURN',
        phrase: 'Turn back.',
        isVerified: true,
      };

    case 'unknown':
      return {
        direction: 'UNKNOWN',
        phrase: '',
        isVerified: true,
        debugNotice: 'Direction marked as Unknown (silent guidance).',
      };

    default:
      // DO NOT GUESS. Mark as unverified.
      return {
        direction: 'DIRECTION_UNVERIFIED',
        phrase: '',
        isVerified: false,
        debugNotice: 'Direction requires manual verification.',
      };
  }
}

class VoiceNavigationService {
  private enabled: boolean = true;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private voicesLoaded: boolean = false;
  private lastSpokenKey: string | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.initVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }

      const saved = localStorage.getItem('campnav_voice_enabled');
      if (saved !== null) {
        this.enabled = saved === 'true';
      }
    }
  }

  private initVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    // Prefer clear English voices
    const enInVoice =
      voices.find((v) => (v.lang === 'en-IN' || v.lang.startsWith('en_IN')) && !v.name.includes('Google')) ||
      voices.find((v) => v.lang === 'en-IN' || v.lang.startsWith('en_IN'));

    const enGbVoice = voices.find((v) => v.lang === 'en-GB' || v.lang.startsWith('en_GB'));
    const enUsVoice = voices.find((v) => v.lang === 'en-US' || v.lang.startsWith('en_US'));
    const anyEnVoice = voices.find((v) => v.lang.startsWith('en'));

    this.selectedVoice = enInVoice || enGbVoice || enUsVoice || anyEnVoice || voices[0];
    this.voicesLoaded = true;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (typeof window !== 'undefined') {
      localStorage.setItem('campnav_voice_enabled', String(val));
    }
    if (!val) {
      this.cancel();
    }
  }

  public cancel() {
    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        console.warn('Speech cancellation failed:', err);
      }
    }
  }

  public reset() {
    this.lastSpokenKey = null;
    this.cancel();
  }

  public speak(text: string, rate: number = 1.0, pitch: number = 1.0) {
    if (!this.isSupported() || !this.enabled || !text.trim()) return;

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 1.0;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis failed:', err);
    }
  }

  /**
   * Speaks the natural human walking instruction for the active step.
   * Strictly avoids node numbers, IDs, or raw photo labels.
   */
  public speakStep(
    step: NavigationStep,
    destinationTitle?: string,
    routeId?: string,
    options?: { isFaculty?: boolean; departmentName?: string }
  ) {
    if (!this.enabled || !this.isSupported() || !step) return;

    const resolution = resolveVoiceDirection(step, destinationTitle, options);

    // If direction is not verified, DO NOT GUESS.
    if (!resolution.isVerified || !resolution.phrase) {
      console.warn(
        `[VoiceNavigation Debug] Step ${step.nodeId} → ${step.targetNodeId || 'dest'}: ${
          resolution.debugNotice || 'Direction requires manual verification.'
        }`
      );
      return;
    }

    // Deduplication check so same active step is not spoken repeatedly
    const stepKey = `${routeId || 'nav'}_step_${step.stepIndex}_${step.nodeId}_${step.targetNodeId || 'dest'}_${resolution.direction}`;
    if (this.lastSpokenKey === stepKey) {
      return;
    }
    this.lastSpokenKey = stepKey;

    this.speak(resolution.phrase);
  }

  /**
   * Final destination arrival announcement.
   * Uses verified destination title e.g. "You have arrived at AB13."
   * For faculty members, naturally announces their department room e.g. "You have arrived at Department of BVoc."
   */
  public announceArrival(
    destinationTitle?: string,
    routeId?: string,
    options?: { isFaculty?: boolean; departmentName?: string }
  ) {
    if (!this.enabled || !this.isSupported()) return;

    const targetName = (options?.isFaculty && options?.departmentName?.trim())
      ? options.departmentName.trim()
      : destinationTitle?.trim();
    const cleanDest = targetName;
    const phrase = cleanDest ? `You have arrived at ${cleanDest}.` : 'You have arrived at your destination.';

    const arrivalKey = `${routeId || 'nav'}_arrived_${cleanDest || 'dest'}`;
    if (this.lastSpokenKey === arrivalKey) {
      return;
    }
    this.lastSpokenKey = arrivalKey;

    this.speak(phrase, 0.95, 1.0);
  }
}

export const voiceNavigation = new VoiceNavigationService();
