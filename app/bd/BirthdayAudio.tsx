'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type BirthdayTrack = 'temple' | 'observatory';

type BirthdayAudioValue = {
  enabled: boolean;
  activeTrack: BirthdayTrack | null;
  selectTrack: (track: BirthdayTrack) => Promise<boolean>;
  toggle: (track: BirthdayTrack) => Promise<void>;
  chime: (index: number, baseFrequency?: number) => void;
};

const TRACKS: Record<BirthdayTrack, { src: string; volume: number }> = {
  temple: { src: '/hb/2026/templemusic.mp3', volume: 0.26 },
  observatory: { src: '/hb/2026/observatory.mp3', volume: 0.24 },
};

const AUDIO_PREFERENCE_KEY = 'jmill_birthday_audio_preference';
const BirthdayAudioContext = createContext<BirthdayAudioValue | null>(null);

function readAudioPreference(): 'unknown' | 'on' | 'off' {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const saved = localStorage.getItem(AUDIO_PREFERENCE_KEY);
    return saved === 'off' ? 'off' : saved === 'on' ? 'on' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function BirthdayAudioProvider({ children }: { children: ReactNode }) {
  const tracks = useRef<Record<BirthdayTrack, HTMLAudioElement> | null>(null);
  const desiredTrack = useRef<BirthdayTrack | null>(null);
  const preference = useRef<'unknown' | 'on' | 'off'>(readAudioPreference());
  const fadeFrame = useRef<number | null>(null);
  const chimeContext = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [activeTrack, setActiveTrack] = useState<BirthdayTrack | null>(null);

  const ensureTracks = useCallback(() => {
    if (tracks.current) return tracks.current;
    tracks.current = {
      temple: new Audio(TRACKS.temple.src),
      observatory: new Audio(TRACKS.observatory.src),
    };
    Object.values(tracks.current).forEach((audio) => {
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
    });
    return tracks.current;
  }, []);

  const fade = useCallback(
    (
      nextVolumes: Record<BirthdayTrack, number>,
      duration: number,
      onComplete?: () => void
    ) => {
      const currentTracks = ensureTracks();
      if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
      const startedAt = performance.now();
      const startingVolumes = {
        temple: currentTracks.temple.volume,
        observatory: currentTracks.observatory.volume,
      };
      const update = (now: number) => {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = progress * progress * (3 - 2 * progress);
        (Object.keys(currentTracks) as BirthdayTrack[]).forEach((track) => {
          currentTracks[track].volume =
            startingVolumes[track] +
            (nextVolumes[track] - startingVolumes[track]) * eased;
        });
        if (progress < 1) {
          fadeFrame.current = requestAnimationFrame(update);
          return;
        }
        fadeFrame.current = null;
        onComplete?.();
      };
      fadeFrame.current = requestAnimationFrame(update);
    },
    [ensureTracks]
  );

  const selectTrack = useCallback(
    async (track: BirthdayTrack) => {
      desiredTrack.current = track;
      if (preference.current === 'off') return false;
      const currentTracks = ensureTracks();
      const target = currentTracks[track];
      const otherTrack: BirthdayTrack = track === 'temple' ? 'observatory' : 'temple';
      const other = currentTracks[otherTrack];
      try {
        await target.play();
        setEnabled(true);
        setActiveTrack(track);
        fade(
          {
            temple: track === 'temple' ? TRACKS.temple.volume : 0,
            observatory: track === 'observatory' ? TRACKS.observatory.volume : 0,
          },
          760,
          () => {
            if (desiredTrack.current === track && other.volume === 0) other.pause();
          }
        );
        return true;
      } catch {
        setEnabled(false);
        return false;
      }
    },
    [ensureTracks, fade]
  );

  const stop = useCallback(() => {
    const currentTracks = ensureTracks();
    preference.current = 'off';
    localStorage.setItem(AUDIO_PREFERENCE_KEY, 'off');
    fade({ temple: 0, observatory: 0 }, 360, () => {
      currentTracks.temple.pause();
      currentTracks.observatory.pause();
    });
    setEnabled(false);
  }, [ensureTracks, fade]);

  const toggle = useCallback(
    async (track: BirthdayTrack) => {
      if (enabled) {
        stop();
        return;
      }
      preference.current = 'on';
      localStorage.setItem(AUDIO_PREFERENCE_KEY, 'on');
      await selectTrack(track);
    },
    [enabled, selectTrack, stop]
  );

  const chime = useCallback((index: number, baseFrequency = 176) => {
    if (!enabled) return;
    const context = chimeContext.current ?? new AudioContext();
    chimeContext.current = context;
    void context.resume();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = baseFrequency * Math.pow(1.12, index);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 1.4);
  }, [enabled]);

  useEffect(() => {
    const handleVisibility = () => {
      const track = desiredTrack.current;
      const currentTracks = tracks.current;
      if (!track || !currentTracks || !enabled) return;
      if (document.visibilityState === 'hidden') currentTracks[track].pause();
      else void currentTracks[track].play();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [enabled]);

  useEffect(
    () => () => {
      if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
      if (tracks.current) {
        tracks.current.temple.pause();
        tracks.current.observatory.pause();
      }
      void chimeContext.current?.close();
    },
    []
  );

  const value = useMemo(
    () => ({ enabled, activeTrack, selectTrack, toggle, chime }),
    [activeTrack, chime, enabled, selectTrack, toggle]
  );

  return (
    <BirthdayAudioContext.Provider value={value}>
      {children}
    </BirthdayAudioContext.Provider>
  );
}

export function useBirthdayAudio() {
  const value = useContext(BirthdayAudioContext);
  if (!value) throw new Error('Birthday audio provider is missing');
  return value;
}
