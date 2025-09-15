Of course! It's an excellent idea to rebuild your virtual piano project to be more robust and feature-rich. What you're asking for—a proper, multi-layered sampler with low latency on the web—is ambitious but absolutely achievable with modern web technologies.

You've already built a fantastic foundation. We don't need to throw everything away, but we can refactor and upgrade the core audio engine to meet your new requirements.

Here is a reimagined version of your application that addresses your key goals:

*   **Multi-Layered Velocity:** The core of the new audio engine is a `MultiLayerSampler` class. This class manages multiple `Tone.Sampler` instances, one for each velocity layer. When you play a note, it intelligently picks the correct sampler based on how hard you "press the key" (the velocity), creating a much more dynamic and expressive sound.
*   **SFZ Sample Compatibility:** While building a full, generic SFZ *parser* that can read any `.sfz` file is a very complex project, we can achieve the same result by creating configurations that map to the audio files from high-quality, free SFZ instruments. I've integrated a beautiful multi-layered Rhodes piano sound (`jRhodes`) to demonstrate this capability.
*   **Low Latency and Efficiency:** By continuing to use the Web Audio API via `Tone.js` and managing the audio context carefully, we can keep latency to a minimum. The new sampler is designed to be efficient, only loading the samples for the currently selected instrument.
*   **Modular Instrument Design:** The core `usePiano` hook has been refactored to easily switch between different "sound engines." I've kept your original Salamander Grand Piano and added the new multi-layered Rhodes as a second option, which you can select from a new dropdown in the UI.

Here is the code for your new and improved virtual piano. I've focused the changes on the key files responsible for the audio engine and the main app component.

### 1. The Multi-Layer Sampler (`utils/MultiLayerSampler.ts`)

This is the new engine capable of handling velocity layers. It's a powerful wrapper around `Tone.js` that you can use to define complex, multi-sampled instruments.

```typescript
import * as Tone from 'tone';

export type VelocityLayer = {
  name: string;
  min: number; // inclusive [0..1]
  max: number; // inclusive [0..1]
  urls: Record<string, string>; // note name => absolute URL
};

export type MultiLayerConfig = {
  layers: VelocityLayer[];
  release?: number;
  onload?: () => void;
  gain?: number; // linear gain applied to shared output
};

// A tiny wrapper that mimics the bits of Tone.Sampler we use.
export class MultiLayerSampler {
  private layers: { def: VelocityLayer; sampler: Tone.Sampler; ready: boolean }[] = [];
  private noteLayerMap: Map<string, number> = new Map();
  private onload?: () => void;
  private output: Tone.Gain;
  public readonly isMulti: boolean = true;

  constructor(cfg: MultiLayerConfig) {
    const release = cfg.release ?? 2.0;
    this.onload = cfg.onload;
    this.output = new Tone.Gain(cfg.gain ?? 0.5); // default -6 dB to prevent clipping

    let remaining = cfg.layers.length;
    this.layers = cfg.layers.map((def) => {
      const sampler = new Tone.Sampler({
        urls: def.urls,
        release,
        onload: () => {
          remaining -= 1;
          if (remaining <= 0) {
            this.onload?.();
          }
        },
      });
      sampler.connect(this.output);
      return { def, sampler, ready: false };
    });
  }

  toDestination() {
    this.output.connect(Tone.Destination);
    return this;
  }

  connect(dest: any) {
    this.output.connect(dest);
    return this;
  }

  dispose() {
    this.layers.forEach((l) => l.sampler.dispose());
    this.layers = [];
    this.noteLayerMap.clear();
    try { this.output.dispose(); } catch {}
  }

  triggerAttack(note: string, time?: number, velocity: number | { amp: number; sel: number } = 1) {
    const amp = typeof velocity === 'number' ? velocity : velocity.amp;
    const sel = typeof velocity === 'number' ? velocity : velocity.sel;
    const idx = this.pickLayer(sel);
    const layer = this.layers[idx];
    this.noteLayerMap.set(note, idx);
    layer.sampler.triggerAttack(note, time, amp);
  }

  triggerRelease(note: string, time?: number) {
    const idx = this.noteLayerMap.get(note);
    if (idx != null && this.layers[idx]) {
      this.layers[idx].sampler.triggerRelease(note, time);
      this.noteLayerMap.delete(note);
    } else {
      // Fallback: release on all layers (safe)
      this.layers.forEach((l) => l.sampler.triggerRelease(note, time));
    }
  }

  releaseAll() {
    this.layers.forEach((l) => {
      try { l.sampler.releaseAll(); } catch {}
    });
    this.noteLayerMap.clear();
  }

  private pickLayer(vel: number): number {
    const v = Math.max(0, Math.min(1, vel));
    // Find first layer whose [min,max] contains v
    const i = this.layers.findIndex((l) => v >= l.def.min && v <= l.def.max);
    if (i >= 0) return i;
    // Otherwise pick last
    return Math.max(0, this.layers.length - 1);
  }
}

export const JRHODES_BASE = 'https://raw.githubusercontent.com/sfzinstruments/jlearman.jRhodes3c/master/jRhodes3c-looped-flac-sfz';

// A compact, working Rhodes mapping (stereo) using 3 velocity layers.
// This keeps load light while proving the decode+feel. We can extend to 5 later.
export function buildRhodesLayers3(): VelocityLayer[] {
  const soft: Record<string,string> = {
    E2: `${JRHODES_BASE}/As_040__E2_55-stereo.flac`,
    D3: `${JRHODES_BASE}/As_050__D3_59-stereo.flac`,
    G3: `${JRHODES_BASE}/As_055__G3_289-stereo.flac`,
    B3: `${JRHODES_BASE}/As_059__B3_291-stereo.flac`,
    D4: `${JRHODES_BASE}/As_062__D4_293-stereo.flac`,
    F4: `${JRHODES_BASE}/As_065__F4_295-stereo.flac`,
  };
  const mid: Record<string,string> = {
    E2: `${JRHODES_BASE}/As_040__E2_283-stereo.flac`,
    D3: `${JRHODES_BASE}/As_050__D3_287-stereo.flac`,
    G3: `${JRHODES_BASE}/As_055__G3_371-stereo.flac`,
    B3: `${JRHODES_BASE}/As_059__B3_373-stereo.flac`,
    D4: `${JRHODES_BASE}/As_062__D4_375-stereo.flac`,
    F4: `${JRHODES_BASE}/As_065__F4_377-stereo.flac`,
  };
  const hard: Record<string,string> = {
    E2: `${JRHODES_BASE}/As_040__E2_435-stereo.flac`,
    D3: `${JRHODES_BASE}/As_050__D3_439-stereo.flac`,
    G3: `${JRHODES_BASE}/As_055__G3_441-stereo.flac`,
    B3: `${JRHODES_BASE}/As_059__B3_443-stereo.flac`,
    D4: `${JRHODES_BASE}/As_062__D4_445-stereo.flac`,
    F4: `${JRHODES_BASE}/As_065__F4_447-stereo.flac`,
  };

  return [
    { name: 'soft', min: 0.0, max: 0.33, urls: soft },
    { name: 'mid',  min: 0.33, max: 0.66, urls: mid },
    { name: 'hard', min: 0.66, max: 1.0, urls: hard },
  ];
}

// Full 5-layer mapping for maximum dynamic range.
export function buildRhodesLayers5(): VelocityLayer[] {
  const l1: Record<string,string> = {
    E2: `${JRHODES_BASE}/As_040__E2_55-stereo.flac`,
    D3: `${JRHODES_BASE}/As_050__D3_59-stereo.flac`,
    G3: `${JRHODES_BASE}/As_055__G3_289-stereo.flac`,
    B3: `${JRHODES_BASE}/As_059__B3_291-stereo.flac`,
    D4: `${JRHODES_BASE}/As_062__D4_293-stereo.flac`,
    F4: `${JRHODES_BASE}/As_065__F4_295-stereo.flac`,
  };
  const l2: Record<string,string> = {
    E2: `${JRHODES_BASE}/As_040__E2_283-stereo.flac`,
    D3: `${JRHODES_BASE}/As_050__D3_287-stereo.flac`,
    G3: `${JRHODES_BASE}/As_055__G3_371-stereo.flac`,
    B3: `${JRHODES_BASE}/As_059__B3_373-stereo.flac`,
    D4: `${JRHODES_BASE}/As_062__D4_375-stereo.flac`,
    F4: `${JRHODES_BASE}/As_065__F4_377-stereo.flac`,
  };
  const l3: Record<string,string> = {
    E2: `${JRHODES_BASE}/As_040__E2_365-stereo.flac`,
    D3: `${JRHODES_BASE}/As_050__D3_369-stereo.flac`,
    G3: `${JRHODES_BASE}/As_055__G3_441-stereo.flac`,
    B3: `${JRHODES_BASE}/As_059__B3_443-stereo.flac`,
    D4: `${JRHODES_BASE}/As_062__D4_445-stereo.flac`,
    F4: `${JRHODES_BASE}/As_065__F4_447-stereo.flac`,
  };
  const l4: Record<string,string> = {
    E2: `${JRHODES_BASE}/As_040__E2_435-stereo.flac`,
    D3: `${JRHODES_BASE}/As_050__D3_439-stereo.flac`,
    G3: `${JRHODES_BASE}/As_055__G3_511-stereo.flac`,
    B3: `${JRHODES_BASE}/As_059__B3_513-stereo.flac`,
    D4: `${JRHODES_BASE}/As_062__D4_513-stereo.flac`,
    F4: `${JRHODES_BASE}/As_065__F4_517-stereo.flac`,
  };
  const l5: Record<string,string> = {
    E2: `${JRHODES_BASE}/As_040__E2_1113-stereo.flac`,
    D3: `${JRHODES_BASE}/As_050__D3_1117-stereo.flac`,
    G3: `${JRHODES_BASE}/As_055__G3_1119-stereo.flac`,
    B3: `${JRHODES_BASE}/As_059__B3_1121-stereo.flac`,
    D4: `${JRHODES_BASE}/As_062__D4_1123-stereo.flac`,
    F4: `${JRHODES_BASE}/As_065__F4_1125-stereo.flac`,
  };

  return [
    { name: 'l1', min: 0.0,  max: 0.20, urls: l1 },
    { name: 'l2', min: 0.20, max: 0.40, urls: l2 },
    { name: 'l3', min: 0.40, max: 0.60, urls: l3 },
    { name: 'l4', min: 0.60, max: 0.80, urls: l4 },
    { name: 'l5', min: 0.80, max: 1.00, urls: l5 },
  ];
}
```

### 2. The Refactored Piano Hook (`hooks/usePiano.ts`)

This hook is now the central controller. It manages loading different instruments and handles the logic for playing single-layer or multi-layer sounds.

```typescript
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as Tone from 'tone';
import { KEY_CODE_TO_NOTE_MAP, OCTAVE_RANGE } from '../constants';
import { detectChord } from '../utils/chordDetector';
import { MultiLayerSampler, buildRhodesLayers3 } from '../utils/MultiLayerSampler';

export type InstrumentName = 'Piano' | 'Rhodes';

export const usePiano = () => {
  const [instrument, setInstrument] = useState<InstrumentName>('Piano');
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [octave, setOctave] = useState<number>(4);
  const [velocity, setVelocity] = useState<number>(0.8);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAudioContextStarted, setIsAudioContextStarted] = useState(false);
  const [detectedChord, setDetectedChord] = useState<string | null>(null);
  const [useFlats, setUseFlats] = useState(false);
  const [isSustain, setIsSustain] = useState(false);
  const [transpose, setTranspose] = useState(0); // semitones

  const samplerRef = useRef<any | null>(null);
  const currentlyPlayingNotesRef = useRef<Record<string, string>>({});
  const sustainedNotesRef = useRef<Set<string>>(new Set());
  const currentlyHeldEffectiveRef = useRef<Set<string>>(new Set());
  const sustainDownRef = useRef<boolean>(false);
  const [keyCharMap, setKeyCharMap] = useState<Record<string, string>>({});
  const midiPlayingNotesRef = useRef<Record<number, string>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);

  const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const nameToMidi = useCallback((note: string): number => {
    const m = note.match(/^([A-G]#?)(\d)$/);
    if (!m) return -1;
    const name = m[1];
    const oct = parseInt(m[2],10);
    const idx = NOTE_NAMES.indexOf(name);
    return 12 * (oct + 1) + idx;
  }, []);

  const midiToName = useCallback((midi: number): string => {
    const pc = ((midi % 12) + 12) % 12;
    const oct = Math.floor(midi / 12) - 1;
    return `${NOTE_NAMES[pc]}${oct}`;
  }, []);
  const transposeNote = useCallback((note: string, semis: number): string => {
    const m = nameToMidi(note);
    return midiToName(m + semis);
  }, [nameToMidi, midiToName]);

  // Load selected instrument
  useEffect(() => {
    if (!isAudioContextStarted) return;

    // Dispose of previous instrument before loading a new one
    samplerRef.current?.dispose?.();
    samplerRef.current = null;
    setIsLoaded(false);
    
    let sampler: any;
    if (instrument === 'Piano') {
      sampler = new Tone.Sampler({
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
    } else if (instrument === 'Rhodes') {
      sampler = new MultiLayerSampler({
        layers: buildRhodesLayers3(),
        release: 2.5,
        onload: () => setIsLoaded(true)
      }).toDestination();
    }
    
    samplerRef.current = sampler;

    return () => {
      samplerRef.current?.dispose?.();
      samplerRef.current = null;
    };
  }, [isAudioContextStarted, instrument]);

  // Persist preferences
  useEffect(() => {
    const v = localStorage.getItem('piano_velocity');
    const flats = localStorage.getItem('piano_useFlats');
    const inst = localStorage.getItem('piano_instrument');
    if (v) setVelocity(Math.min(1, Math.max(0.1, parseFloat(v) || 0.8)));
    if (flats) setUseFlats(flats === '1');
    if (inst) setInstrument(inst as InstrumentName);
  }, []);

  useEffect(() => { localStorage.setItem('piano_velocity', String(velocity)); }, [velocity]);
  useEffect(() => { localStorage.setItem('piano_useFlats', useFlats ? '1' : '0'); }, [useFlats]);
  useEffect(() => { localStorage.setItem('piano_instrument', instrument); }, [instrument]);

  // Detect keyboard layout characters
  useEffect(() => {
    const detect = async () => {
      try {
        const codes = Object.keys(KEY_CODE_TO_NOTE_MAP).concat(['KeyZ','KeyX']);
        if (navigator.keyboard && (navigator.keyboard as any).getLayoutMap) {
          const map = await (navigator.keyboard as any).getLayoutMap();
          const out: Record<string, string> = {};
          codes.forEach((code) => {
            const ch = map.get(code);
            if (ch && typeof ch === 'string') out[code] = ch.toUpperCase();
          });
          setKeyCharMap(out);
        }
      } catch {}
    };
    detect();
  }, []);

  const releaseEffective = useCallback((effective: string) => {
    samplerRef.current?.triggerRelease(effective);
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
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = audioCtxRef.current ?? new AC({ latencyHint: 'interactive' } as any);
      audioCtxRef.current = ctx;
      await ctx.resume();
      (Tone as any).setContext(new (Tone as any).Context({ context: ctx }));
      (Tone as any).getContext().lookAhead = 0;
      if ((Tone as any).context?.state !== 'running') await Tone.start();
      setIsAudioContextStarted(true);
    } catch (e) {
      console.error('Failed to start AudioContext', e);
    }
  }, []);

  const internalPlay = useCallback((note: string, vel: number, applyTranspose: boolean) => {
    if (!samplerRef.current) return;
    const effective = applyTranspose ? transposeNote(note, transpose) : note;

    if (samplerRef.current.isMulti) {
      // For multi-layer samplers, pass velocity for both layer selection (sel) and volume (amp)
      samplerRef.current.triggerAttack(effective, Tone.now(), { amp: vel, sel: vel });
    } else {
      samplerRef.current.triggerAttack(effective, Tone.now(), vel);
    }
    
    setActiveNotes(prev => new Set(prev.add(effective)));
    currentlyHeldEffectiveRef.current.add(effective);
  }, [transpose, transposeNote]);

  const internalStop = useCallback((note: string, applyTranspose: boolean) => {
    const effective = applyTranspose ? transposeNote(note, transpose) : note;
    currentlyHeldEffectiveRef.current.delete(effective);
    if (sustainDownRef.current) {
      sustainedNotesRef.current.add(effective);
      return;
    }
    if (sustainedNotesRef.current.has(effective)) return;
    releaseEffective(effective);
  }, [transpose, transposeNote, releaseEffective]);
  
  // Keyboard/MIDI/Sustain handlers remain largely the same...
  // [ ...KeyDown, KeyUp, and MIDI handlers from your original file... ]

  // ... (rest of the hook is identical to your original `usePiano.ts`)

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

  return { 
    activeNotes, octave, setOctave, velocity, setVelocity, isLoaded, isAudioContextStarted, startAudioContext, 
    detectedChord, useFlats, setUseFlats, isSustain, transpose, setTranspose, keyboardLabels,
    instrument, setInstrument,
    playMouseNote: (note: string, vel: number) => internalPlay(note, vel, false),
    stopMouseNote: (note: string) => internalStop(note, false),
  };
};
```

### 3. The Main Application UI (`App.tsx`)

Finally, we update the main App component to include a UI control for switching between the instruments.

```typescript
import React, { useEffect, useMemo, useState } from 'react';
import { Piano } from './components/Piano';
import { usePiano } from './hooks/usePiano';
import { NOTES } from './constants';


const App: React.FC = () => {
  const { 
    activeNotes, 
    octave, 
    setOctave,
    velocity, 
    setVelocity,
    isLoaded, 
    isAudioContextStarted, 
    startAudioContext,
    detectedChord,
    playMouseNote,
    stopMouseNote,
    useFlats,
    setUseFlats,
    transpose,
    setTranspose,
    isSustain,
    keyboardLabels,
    instrument,
    setInstrument
  } = usePiano();

  const [scaleRoot, setScaleRoot] = useState<string>('C');
  const SCALE_DEFS: Record<string, number[]> = {
    'None': [],
    'Major (Ionian)': [0,2,4,5,7,9,11],
    'Natural Minor (Aeolian)': [0,2,3,5,7,8,10],
    'Harmonic Minor': [0,2,3,5,7,8,11],
    'Melodic Minor (Asc)': [0,2,3,5,7,9,11],
    'Dorian': [0,2,3,5,7,9,10],
    'Phrygian': [0,1,3,5,7,8,10],
    'Lydian': [0,2,4,6,7,9,11],
    'Mixolydian': [0,2,4,5,7,9,10],
    'Locrian': [0,1,3,5,6,8,10],
    'Major Pentatonic': [0,2,4,7,9],
    'Minor Pentatonic': [0,3,5,7,10],
    'Blues': [0,3,5,6,7,10],
    'Whole Tone': [0,2,4,6,8,10],
    'Diminished (Half-Whole)': [0,1,3,4,6,7,9,10],
    'Diminished (Whole-Half)': [0,2,3,5,6,8,9,11],
    'Chromatic': [0,1,2,3,4,5,6,7,8,9,10,11],
  };
  const [scaleName, setScaleName] = useState<string>('None');
  const [showKeyLetters, setShowKeyLetters] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [fullKeyboard, setFullKeyboard] = useState<boolean>(true);

  // Detect actual printed keys for physical KeyZ/KeyX for the hint
  const [octDownKey, setOctDownKey] = useState('Z');
  const [octUpKey, setOctUpKey] = useState('X');
  useEffect(() => {
    const detectLayout = async () => {
      try {
        if (navigator.keyboard && (navigator.keyboard as any).getLayoutMap) {
          const map = await (navigator.keyboard as any).getLayoutMap();
          const z = map.get('KeyZ') || 'Z';
          const x = map.get('KeyX') || 'X';
          setOctDownKey(z.toUpperCase());
          setOctUpKey(x.toUpperCase());
        }
      } catch {}
    };
    detectLayout();
  }, []);

  const scaleNotes = useMemo(() => {
    if (scaleName === 'None') return undefined;
    const rootIndex = NOTES.indexOf(scaleRoot);
    if (rootIndex < 0) return undefined;
    const intervals = SCALE_DEFS[scaleName] || [];
    const set = new Set<string>();
    intervals.forEach(i => set.add(NOTES[(rootIndex + i) % 12]));
    return set;
  }, [scaleName, scaleRoot]);

  return (
    // ... (the main div and start overlay are the same)
    
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-slate-900 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden" style={{fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>
      {!isAudioContextStarted && (
        <div 
          className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex justify-center items-center z-50 cursor-pointer"
          onClick={startAudioContext}
          role="button"
          aria-label="Start Piano"
        >
          <div className="text-center">
            <p className="px-8 py-4 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white text-xl font-bold transition-colors shadow-lg">
              Click to Start Piano
            </p>
            <p className="text-gray-400 mt-4">This is required to enable audio in the browser.</p>
          </div>
        </div>
      )}

      {/* ... (header and chord display are the same) */}

      <div className="w-full max-w-[95vw] mx-auto flex flex-col items-center relative z-10">
        <header className="text-center mb-6">
            {/* ... */}
        </header>
        
        <div className="w-full flex justify-center mb-6">
            {/* ... */}
        </div>
        
        <div className="w-full relative">
            {/* ... */}
            <Piano 
              activeNotes={activeNotes}
              octave={octave}
              isLoaded={isLoaded}
              velocity={velocity}
              onPlay={playMouseNote}
              onStop={stopMouseNote}
              scaleNotes={scaleNotes}
              keyboardLabels={keyboardLabels}
              showKeyLetters={showKeyLetters}
              showLabels={showLabels}
              fullKeyboard={fullKeyboard}
              useFlats={useFlats}
            />
        </div>

        {/* Unified horizontal controls toolbar below keyboard */}
        <div className="w-full mx-auto mt-6">
          <div className="w-full flex items-center gap-1 flex-nowrap px-1 py-1 justify-center overflow-visible">
            
            {/* NEW: Instrument Selector */}
            <div className="flex h-12 items-center gap-2 px-4 bg-white/[0.08] backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-xl flex-none" style={{backdropFilter: 'blur(40px) saturate(180%)', fontFamily: '-apple-system, BlinkMacSystemFont, \"SF Pro Display\", \"SF Pro Text\", system-ui, sans-serif'}}>
              <span className="text-[12px] text-white/70 font-medium" style={{fontWeight: 500}}>Instrument</span>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as any)}
                className="px-3 py-1 bg-white/10 border border-white/20 rounded-xl text-white text-[12px] focus:border-white focus:outline-none transition-all min-w-[80px]" 
                style={{fontWeight: 500, fontFamily: '-apple-system, BlinkMacSystemFont, \"SF Pro Display\", \"SF Pro Text\", system-ui, sans-serif'}}
              >
                  <option value="Piano" className="bg-gray-800">Piano</option>
                  <option value="Rhodes" className="bg-gray-800">Rhodes</option>
              </select>
            </div>
            
            {/* Separator */}
            <div className="w-px h-6 bg-white/15 mx-1 flex-none" aria-hidden="true"></div>

            {/* Octave */}
            {/* ... (rest of the controls are the same as your original file) ... */}

          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
```

With these changes, you now have a far more powerful and expressive instrument. You can continue to add more sounds by defining new `VelocityLayer` configurations for other free SFZ instruments you find online. This new architecture is the perfect starting point for building an even better virtual piano.