import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as Tone from 'tone';
import { KEY_CODE_TO_NOTE_MAP, OCTAVE_RANGE } from '../constants';
import { detectChord } from '../utils/chordDetector';
// Piano-only sampler (Salamander)

// Using Tone.js via npm package

export type InstrumentName = 'Piano';

export const usePiano = () => {
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [octave, setOctave] = useState<number>(4);
  const VELOCITY_STEPS = [1, 20, 40, 60, 80, 100, 127] as const;
  const [velocity, setVelocity] = useState<number>(100);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAudioContextStarted, setIsAudioContextStarted] = useState(false);
  const [detectedChord, setDetectedChord] = useState<string | null>(null);
  const [useFlats, setUseFlats] = useState(false);
  const [isSustain, setIsSustain] = useState(false);
  const [transpose, setTranspose] = useState(0); // semitones
  // Fixed instrument: Piano only
  // 88-key fixed layout only
  // Octave change keys (layout aware)
  const [octaveDownCode, setOctaveDownCode] = useState<string>('KeyZ');
  const [octaveUpCode, setOctaveUpCode] = useState<string>('KeyX');
  const [octaveHintDown, setOctaveHintDown] = useState<string>('Z');
  const [octaveHintUp, setOctaveHintUp] = useState<string>('X');

  // Single engine: Tone.Sampler
  const samplerRef = useRef<any | null>(null);
  // No SFZ engine
  const currentlyPlayingNotesRef = useRef<Record<string, string>>({});
  const sustainedNotesRef = useRef<Set<string>>(new Set()); // effective notes sustained
  const currentlyHeldEffectiveRef = useRef<Set<string>>(new Set()); // effective notes physically held
  const sustainDownRef = useRef<boolean>(false); // physical sustain key state
  const [keyCharMap, setKeyCharMap] = useState<Record<string, string>>({});
  // Track MIDI-played notes by note number to ensure exact release
  const midiPlayingNotesRef = useRef<Record<number, string>>({});
  // Native AudioContext we explicitly create on user gesture; used for sfizz and Tone
  const audioCtxRef = useRef<AudioContext | null>(null);

  // No master chain; route directly to destination for lowest latency

  // Helpers: convert note name <-> midi and transpose
  const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const nameToMidi = useCallback((note: string): number => {
    const m = note.match(/^([A-G]#?)(\d)$/);
    if (!m) return -1;
    const name = m[1];
    const oct = parseInt(m[2],10);
    const idx = NOTE_NAMES.indexOf(name);
    return 12 * (oct + 1) + idx;
  }, []);

  // After revert: single engine; no dynamic switching
  const midiToName = useCallback((midi: number): string => {
    const pc = ((midi % 12) + 12) % 12;
    const oct = Math.floor(midi / 12) - 1;
    return `${NOTE_NAMES[pc]}${oct}`;
  }, []);
  const transposeNote = useCallback((note: string, semis: number): string => {
    const m = nameToMidi(note);
    return midiToName(m + semis);
  }, [nameToMidi, midiToName]);

  // Load piano when audio is started
  useEffect(() => {
    if (!isAudioContextStarted) return;
    // Dispose previous
    try { samplerRef.current?.dispose?.(); } catch {}
    samplerRef.current = null;
    setIsLoaded(false);
    const sampler = new Tone.Sampler({
      urls: {
        A1: 'A1.mp3', A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3', A6: 'A6.mp3',
        C2: 'C2.mp3', C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3', C6: 'C6.mp3', C7: 'C7.mp3',
        'D#2': 'Ds2.mp3', 'D#3': 'Ds3.mp3', 'D#4': 'Ds4.mp3', 'D#5': 'Ds5.mp3', 'D#6': 'Ds6.mp3',
        'F#2': 'Fs2.mp3', 'F#3': 'Fs3.mp3', 'F#4': 'Fs4.mp3', 'F#5': 'Fs5.mp3', 'F#6': 'Fs6.mp3',
      },
      release: 2.5,
      baseUrl: 'https://tonejs.github.io/audio/salamander/',
      onload: () => setIsLoaded(true),
    }).toDestination();
    samplerRef.current = sampler;
    return () => {
      try { samplerRef.current?.dispose?.(); } catch {}
      samplerRef.current = null;
    };
  }, [isAudioContextStarted]);

  // Persist velocity and flats preference
  useEffect(() => {
    const v = localStorage.getItem('piano_velocity');
    const flats = localStorage.getItem('piano_useFlats');
    if (v) {
      const num = parseInt(v, 10);
      if (!Number.isNaN(num)) {
        const clamped = Math.max(1, Math.min(127, num));
        // snap to nearest defined step
        const nearest = VELOCITY_STEPS.reduce((prev, cur) => Math.abs(cur - clamped) < Math.abs(prev - clamped) ? cur : prev, VELOCITY_STEPS[0]);
        setVelocity(nearest);
      }
    }
    if (flats) setUseFlats(flats === '1');
  }, []);
  useEffect(() => {
    localStorage.setItem('piano_velocity', String(velocity));
  }, [velocity]);
  useEffect(() => {
    localStorage.setItem('piano_useFlats', useFlats ? '1' : '0');
  }, [useFlats]);
  // no instrument persistence; piano only
  // no keyboard size persistence; locked to 88

  // Detect keyboard layout characters for our mapped physical codes
  useEffect(() => {
    const detect = async () => {
      try {
        const codes = Object.keys(KEY_CODE_TO_NOTE_MAP).concat(['KeyZ','KeyX']);
        // @ts-ignore
        if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
          // @ts-ignore
          const map = await navigator.keyboard.getLayoutMap();
          const out: Record<string, string> = {};
          codes.forEach(c => {
            const k = map.get(c);
            if (k) out[c] = k.toUpperCase();
          });
          setKeyCharMap(out);
          // Physical keys always KeyZ/KeyX but hints show layout-specific characters
          const isAzerty = (map.get('KeyA') || '').toLowerCase() === 'q';
          const isQwertz = (map.get('KeyY') || '').toLowerCase() === 'z';
          
          // Physical keys always the same
          setOctaveDownCode('KeyZ');
          setOctaveUpCode('KeyX');
          
          // But hints show what those physical positions print on this layout
          if (isAzerty) {
            setOctaveHintDown((map.get('KeyZ') || 'W').toUpperCase()); // KeyZ on AZERTY prints W
            setOctaveHintUp((map.get('KeyX') || 'X').toUpperCase());
          } else if (isQwertz) {
            setOctaveHintDown((map.get('KeyZ') || 'Y').toUpperCase()); // KeyZ on QWERTZ prints Y  
            setOctaveHintUp((map.get('KeyX') || 'X').toUpperCase());
          } else {
            setOctaveHintDown((map.get('KeyZ') || 'Z').toUpperCase()); // KeyZ on QWERTY prints Z
            setOctaveHintUp((map.get('KeyX') || 'X').toUpperCase());
          }
        }
      } catch {}
    };
    detect();
  }, []);
  useEffect(() => {
    const detect = async () => {
      try {
        const codes = Object.keys(KEY_CODE_TO_NOTE_MAP).concat(['KeyZ','KeyX']);
        // @ts-ignore
        if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
          // @ts-ignore
          const map = await navigator.keyboard.getLayoutMap();
          const out: Record<string, string> = {};
          codes.forEach(c => {
            const k = map.get(c);
            if (k) out[c] = k.toUpperCase();
          });
          setKeyCharMap(out);
        } else {
          // Fallback to code-derived letters
          const out: Record<string, string> = {};
          codes.forEach((code) => {
            const guess = code.replace('Key','').replace('Semicolon',';').slice(0,1).toUpperCase();
            out[code] = guess;
          });
          setKeyCharMap(out);
        }
      } catch {
        // ignore
      }
    };
    detect();
  }, []);
  useEffect(() => {
    localStorage.setItem('piano_velocity', String(velocity));
  }, [velocity]);
  useEffect(() => {
    localStorage.setItem('piano_useFlats', useFlats ? '1' : '0');
  }, [useFlats]);
  // no reverb persistence

  // Helper to release an effective note immediately
  const releaseEffective = useCallback((effective: string) => {
    if (samplerRef.current) {
      samplerRef.current.triggerRelease(effective);
    }
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(effective);
      return next;
    });
  }, []);

  useEffect(() => {
    const notesWithOctaves = Array.from(activeNotes) as string[];
    const chord = detectChord(notesWithOctaves, { useFlats });
    setDetectedChord(chord);
  }, [activeNotes, useFlats]);

  const startAudioContext = useCallback(async () => {
    // Create low-latency native AudioContext on explicit user gesture
    try {
      // @ts-ignore - webkit fallback
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx: AudioContext = audioCtxRef.current ?? new AC({ latencyHint: 'interactive' } as any);
      audioCtxRef.current = ctx;
      try { await ctx.resume(); } catch {}
      // Make Tone use our context, not create its own, and remove scheduler lookAhead
      try {
        (Tone as any).setContext(new (Tone as any).Context({ context: ctx }));
        (Tone as any).getContext().lookAhead = 0;
      } catch {}
      try { if ((Tone as any).context?.state !== 'running') await Tone.start(); } catch {}
      setIsAudioContextStarted(true);
    } catch (e) {
      console.error('Failed to start AudioContext', e);
    }
  }, []);

  const internalPlay = useCallback((note: string, vel: number | { amp: number; sel: number }, applyTranspose: boolean) => {
    const effective = applyTranspose ? transposeNote(note, transpose) : note;
    const s = samplerRef.current;
    if (!s) return;
    if (s.isMulti) {
      // MultiLayerSampler: support layer selection separate from amplitude
      if (typeof vel === 'number') {
        // Treat numeric values >=1 as MIDI [1..127]; decimals <1 as normalized [0..1]
        const val = vel >= 1 ? Math.max(1, Math.min(127, Math.floor(vel))) / 127 : Math.max(0, Math.min(1, vel));
        s.triggerAttack(effective, Tone.now(), { amp: Math.max(0.02, val), sel: val });
      } else {
        const amp = Math.max(0.02, Math.min(1, vel.amp));
        const sel = Math.max(0, Math.min(1, vel.sel));
        s.triggerAttack(effective, Tone.now(), { amp, sel });
      }
    } else {
      // Single-layer Sampler: only amp is relevant
      const amp = typeof vel === 'number'
        ? (vel >= 1 ? Math.max(0.02, Math.min(1, Math.floor(vel) / 127)) : Math.max(0.02, Math.min(1, vel)))
        : Math.max(0.02, Math.min(1, vel.amp));
      s.triggerAttack(effective, Tone.now(), amp);
    }
    setActiveNotes(prev => new Set(prev.add(effective)));
    // track physically held effective note
    currentlyHeldEffectiveRef.current.add(effective);
  }, [transpose, transposeNote]);

  const internalStop = useCallback((note: string, applyTranspose: boolean) => {
    const effective = applyTranspose ? transposeNote(note, transpose) : note;
    // this note is no longer physically held
    currentlyHeldEffectiveRef.current.delete(effective);
    if (sustainDownRef.current) {
      // Defer release until pedal is lifted
      sustainedNotesRef.current.add(effective);
      return;
    }
    // If this note was pre-latched into sustain set (pedal pressed while holding), keep it
    if (sustainedNotesRef.current.has(effective)) {
      return;
    }
    // Immediate release
    releaseEffective(effective);
  }, [transpose, transposeNote, releaseEffective]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isAudioContextStarted || !isLoaded || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    
    const code = event.code;

    if (code === 'Space') {
      event.preventDefault();
      sustainDownRef.current = true; // set synchronously to avoid race with other key events
      setIsSustain(true);
      // Pre-latch all currently held effective notes so they will sustain even if released immediately
      currentlyHeldEffectiveRef.current.forEach(eff => sustainedNotesRef.current.add(eff));
      return;
    }

    if (code === octaveDownCode) {
      setOctave(o => Math.max(OCTAVE_RANGE[0], o - 1));
    } else if (code === octaveUpCode) {
      setOctave(o => Math.min(OCTAVE_RANGE[1], o + 1));
    } else if (code === 'KeyC') {
      setVelocity(v => {
        const idx = VELOCITY_STEPS.findIndex(s => s === v);
        return idx > 0 ? (VELOCITY_STEPS as readonly number[])[idx - 1] : VELOCITY_STEPS[0];
      });
    } else if (code === 'KeyV') {
      setVelocity(v => {
        const idx = VELOCITY_STEPS.findIndex(s => s === v);
        return (idx >= 0 && idx < VELOCITY_STEPS.length - 1) ? (VELOCITY_STEPS as readonly number[])[idx + 1] : VELOCITY_STEPS[VELOCITY_STEPS.length - 1];
      });
    } else if (KEY_CODE_TO_NOTE_MAP[code]) {
      // Prevent re-triggering the same key
      if (currentlyPlayingNotesRef.current[code]) return;

      const keyMap = KEY_CODE_TO_NOTE_MAP[code];
      const targetOctave = octave + keyMap.octaveOffset;
      if (targetOctave >= OCTAVE_RANGE[0] && targetOctave <= OCTAVE_RANGE[1]) {
        const note = `${keyMap.note}${targetOctave}`;
        internalPlay(note, velocity, true);
        // Map the keyboard key code to the exact note that was played
        currentlyPlayingNotesRef.current[code] = note; // store base note; stop will transpose again
      }
    }
  }, [octave, velocity, internalPlay, isLoaded, isAudioContextStarted]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    const code = event.code;
    if (code === 'Space') {
      event.preventDefault();
      sustainDownRef.current = false; // clear synchronously first
      setIsSustain(false);
      // release sustained notes that are not currently held down
      const toRelease: string[] = [];
      sustainedNotesRef.current.forEach(eff => {
        if (!currentlyHeldEffectiveRef.current.has(eff)) toRelease.push(eff);
      });
      toRelease.forEach(eff => releaseEffective(eff));
      // clear sustain set regardless; held notes remain sounding as they are held
      sustainedNotesRef.current.clear();
      return;
    }
    // Stop the specific note that was started by this key code, regardless of current octave
    const noteToStop = currentlyPlayingNotesRef.current[code];
    if (noteToStop) {
      internalStop(noteToStop, true);
      delete currentlyPlayingNotesRef.current[code];
    }
  }, [internalStop]);

  // --- Web MIDI support ---
  useEffect(() => {
    let access: any | null = null;
    const inputsBound = new Set<any>();

    const bindInput = (input: any) => {
      if (!input || inputsBound.has(input)) return;
      const onMessage = async (e: any) => {
        const data: Uint8Array = e.data;
        if (!data || data.length < 2) return;
        const status = data[0] & 0xf0;
        const channel = data[0] & 0x0f; // reserved if needed later
        const data1 = data[1];
        const data2 = data.length > 2 ? data[2] : 0;

        // Do not auto-start AudioContext from MIDI; require explicit user gesture via overlay
        if (!isAudioContextStarted) return;

        // Note Off (0x80) or Note On with velocity 0
        if (status === 0x80 || (status === 0x90 && data2 === 0)) {
          const noteNum = data1;
          const baseName = midiPlayingNotesRef.current[noteNum] ?? midiToName(noteNum);
          internalStop(baseName, true);
          delete midiPlayingNotesRef.current[noteNum];
          return;
        }

        // Note On (0x90)
        if (status === 0x90) {
          const noteNum = data1;
          const vel = data2;
          if (vel > 0) {
            const baseName = midiToName(noteNum);
            midiPlayingNotesRef.current[noteNum] = baseName;
            const midiNorm = Math.max(0, Math.min(1, vel / 127));
            const sliderNorm = Math.max(1, Math.min(127, velocity)) / 127; // velocity slider normalized
            const amp = Math.max(0.02, Math.min(1, midiNorm * sliderNorm));
            const sel = midiNorm; // selection strictly by how hard key was hit
            internalPlay(baseName, { amp, sel }, true);
          } else {
            const baseName = midiPlayingNotesRef.current[noteNum] ?? midiToName(noteNum);
            internalStop(baseName, true);
            delete midiPlayingNotesRef.current[noteNum];
          }
          return;
        }

        // Control Change (0xB0)
        if (status === 0xB0) {
          const cc = data1;
          const value = data2;
          if (cc === 64) { // Sustain pedal
            if (value >= 64) {
              sustainDownRef.current = true;
              setIsSustain(true);
              // Pre-latch currently held notes
              currentlyHeldEffectiveRef.current.forEach(eff => sustainedNotesRef.current.add(eff));
            } else {
              sustainDownRef.current = false;
              setIsSustain(false);
              const toRelease: string[] = [];
              sustainedNotesRef.current.forEach(eff => {
                if (!currentlyHeldEffectiveRef.current.has(eff)) toRelease.push(eff);
              });
              toRelease.forEach(eff => releaseEffective(eff));
              sustainedNotesRef.current.clear();
            }
          }
          return;
        }
      };

      input.addEventListener?.('midimessage', onMessage);
      // @ts-ignore
      input.onmidimessage = onMessage;
      inputsBound.add(input);
    };

    const unbindAll = () => {
      inputsBound.forEach((inp: any) => {
        try {
          inp.onmidimessage = null;
          inp.removeEventListener?.('midimessage', inp.onmidimessage);
        } catch {}
      });
      inputsBound.clear();
    };

    const init = async () => {
      try {
        // @ts-ignore
        if (!navigator.requestMIDIAccess) return;
        // @ts-ignore
        access = await navigator.requestMIDIAccess({ sysex: false });
        access.inputs.forEach((input: any) => bindInput(input));
        access.onstatechange = () => {
          access?.inputs?.forEach((input: any) => bindInput(input));
        };
      } catch {
        // ignore
      }
    };

    init();
    return () => {
      if (access) {
        try { access.onstatechange = null; } catch {}
      }
      unbindAll();
    };
  }, [internalPlay, internalStop, midiToName, velocity, isAudioContextStarted, releaseEffective]);
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (samplerRef.current) {
        try { samplerRef.current.releaseAll(); } catch {}
      }
    };
  }, [handleKeyDown, handleKeyUp]);

  const playMouseNote = useCallback((note: string, vel: number) => internalPlay(note, vel, false), [internalPlay]);
  const stopMouseNote = useCallback((note: string) => internalStop(note, false), [internalStop]);

  // Map current octave notes to the user's physical keyboard characters (for on-key labels)
  const keyboardLabels = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(KEY_CODE_TO_NOTE_MAP).forEach(([code, entry]) => {
      const tOct = octave + entry.octaveOffset;
      if (tOct >= OCTAVE_RANGE[0] && tOct <= OCTAVE_RANGE[1]) {
        const ch = (keyCharMap[code] || code.replace('Key','').replace('Semicolon',';')).toString();
        const label = ch ? ch.slice(0,1).toUpperCase() : '';
        map[`${entry.note}${tOct}`] = label;
      }
    });
    return map;
  }, [keyCharMap, octave]);

  return { activeNotes, octave, setOctave, velocity, setVelocity, isLoaded, isAudioContextStarted, startAudioContext, detectedChord, 
    // Keyboard (transposed)
    playNote: (n: string, v: number) => internalPlay(n, v, true),
    stopNote: (n: string) => internalStop(n, true),
    // Mouse (no transpose)
    playMouseNote,
    stopMouseNote,
    useFlats, setUseFlats, isSustain, transpose, setTranspose, keyboardLabels,
    octaveHintDown, octaveHintUp };
};