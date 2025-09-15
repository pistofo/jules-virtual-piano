import React, { useCallback, useMemo } from 'react';
import { NOTES, KEYBOARD_RANGES, KeyboardSize } from '../constants';

interface PianoProps {
  activeNotes: Set<string>;
  octave: number;
  isLoaded: boolean;
  velocity: number;
  onPlay: (note: string, velocity: number) => void;
  onStop: (note: string) => void;
  scaleNotes?: Set<string>; // pitch classes like 'C', 'C#'
  keyboardLabels?: Record<string, string>; // e.g. { 'C4': 'A' }
  showLabels?: boolean; // single toggle controls both key letters and note names
  keyboardSize: KeyboardSize; // 25|49|61|76|81|88
  useFlats?: boolean;
}

const LoadingPiano: React.FC = () => (
    <div className="relative flex w-full h-72 bg-[#353A41] p-4 rounded-b-lg shadow-inner select-none justify-center items-center">
        <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mb-4"></div>
            <p className="text-lg text-gray-300">Loading piano samples...</p>
        </div>
    </div>
);


export const Piano: React.FC<PianoProps> = ({ activeNotes, octave, isLoaded, velocity, onPlay, onStop, scaleNotes, keyboardLabels, showLabels = true, keyboardSize, useFlats = false, transpose }) => {
  if (!isLoaded) {
    return <LoadingPiano />;
  }

  // Helpers to convert note names to midi and back
  const NOTE_INDEX: Record<string, number> = useMemo(() => ({ C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11 }), []);
  const nameToMidi = useCallback((noteWithOct: string) => {
    const m = noteWithOct.match(/^([A-G]#?)(\d)$/);
    if (!m) return -1;
    const name = m[1];
    const oct = parseInt(m[2], 10);
    const idx = NOTE_INDEX[name];
    return 12 * (oct + 1) + idx;
  }, [NOTE_INDEX]);
  const midiToParts = useCallback((midi: number) => {
    const pc = ((midi % 12) + 12) % 12;
    const oct = Math.floor(midi / 12) - 1;
    const note = NOTES[pc];
    return { note, octave: oct };
  }, []);
  const isBlackMidi = useCallback((midi: number) => NOTES[((midi % 12) + 12) % 12].includes('#'), []);

  // Extract active notes with octaves for visual feedback
  // Need to reverse-map effective (transposed) notes back to visual keys
  const activeNotesWithOct = useMemo(() => {
    const set = new Set<string>();
    // For each active note, figure out which visual key should be highlighted
    activeNotes.forEach(effectiveNote => {
      // Try to find which original note would produce this effective note
      // This is the inverse of the transpose operation
      const effectiveMidi = nameToMidi(effectiveNote);
      if (effectiveMidi === -1) return;
      
      // Reverse the transpose to get original note
      const originalMidi = effectiveMidi - (transpose || 0);
      if (originalMidi < 0 || originalMidi > 127) return;
      
      const originalParts = midiToParts(originalMidi);
      const originalNote = `${originalParts.note}${originalParts.octave}`;
      
      set.add(originalNote);
    });
    return set;
  }, [activeNotes, transpose, nameToMidi, midiToParts]);
  const inScale = (pc: string) => scaleNotes ? scaleNotes.has(pc) : true;
  const isMouseDown = (e: React.MouseEvent) => (e.buttons & 1) === 1;
  const handleDown = useCallback((note: string) => onPlay(note, velocity), [onPlay, velocity]);
  const handleUp = useCallback((note: string) => onStop(note), [onStop]);

  // Build 88-key white index map so proportions remain constant (52 white keys)
  const whiteIndexOfMidi = useMemo(() => {
    const map = new Map<number, number>();
    const low88 = nameToMidi('A0');
    const hi88 = nameToMidi('C8');
    let idx = 0;
    for (let m = low88; m <= hi88; m++) {
      if (!isBlackMidi(m)) {
        map.set(m, idx);
        idx += 1;
      }
    }
    return map; // midi -> whiteIndex [0..51]
  }, [nameToMidi, isBlackMidi]);

  // Keys to render for selected size; compute local white-index base to pack contiguously
  const rangeData = useMemo(() => {
    const range = KEYBOARD_RANGES[keyboardSize];
    const lo = nameToMidi(range.low);
    const hi = nameToMidi(range.high);
    // find first white key at or above lo
    let firstWhiteMidi = lo;
    while (isBlackMidi(firstWhiteMidi) && firstWhiteMidi <= hi) firstWhiteMidi++;
    const baseWIndex = whiteIndexOfMidi.get(firstWhiteMidi) ?? 0;
    const keys: { note: string; octave: number; midi: number; wIndex: number; localIndex: number }[] = [];
    let whiteCount = 0;
    for (let m = lo; m <= hi; m++) {
      if (!isBlackMidi(m)) {
        const { note, octave: o } = midiToParts(m);
        const wIndex = whiteIndexOfMidi.get(m);
        if (wIndex != null) {
          const localIndex = wIndex - baseWIndex;
          keys.push({ note, octave: o, midi: m, wIndex, localIndex });
          whiteCount += 1;
        }
      }
    }
    return { keys, baseWIndex, whiteCount, lo, hi };
  }, [keyboardSize, nameToMidi, midiToParts, isBlackMidi, whiteIndexOfMidi]);

  const whiteKeys = rangeData.keys;
  const totalWhiteKeys = rangeData.whiteCount;
  // Ratio of black key width relative to white key width (top surface ~0.58x typical)
  const blackRatio = 0.58; // realistic
  const blackKeyWidth = useMemo(() => `calc(var(--whiteW) * ${blackRatio})`, [blackRatio]);
  // Black key visible length relative to white key visible length (~0.60 ~ just above half)
  // Apply to both single-octave and full-keyboard modes
  const blackKeyHeight = useMemo(() => 'calc(100% * 0.60)', []);
  // Keep per-key width constant; overall keyboard width varies by number of white keys
  const containerVarsStyle = useMemo<React.CSSProperties>(() => ({
    // Adjust white key width responsively, but independent of layout size
    // This scales with viewport but remains identical across 25/49/61/76/88
    // Tweak the clamp to taste
    ['--whiteW' as any]: 'clamp(22px, 1.8vw, 36px)',
  }), []);
  const keyboardWidthStyle = useMemo<React.CSSProperties>(() => ({ width: `calc(var(--whiteW) * ${totalWhiteKeys})` }), [totalWhiteKeys]);
  const containerHeightStyle = useMemo<React.CSSProperties>(() => ({ height: 'calc(var(--whiteW) * 5.5)' }), []);
  const gridStyle: React.CSSProperties = useMemo(() => ({ gridTemplateColumns: `repeat(${totalWhiteKeys}, var(--whiteW))` }), [totalWhiteKeys]);
  const sharpToFlat: Record<string, string> = useMemo(() => ({ 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb' }), []);
  const displayAccidental = useCallback((n: string) => useFlats ? (sharpToFlat[n] || n) : n, [useFlats, sharpToFlat]);

  return (
    <div
      className={`relative bg-gradient-to-b from-gray-800 to-gray-900 p-1 rounded-b-3xl select-none touch-none mx-auto`}
      style={{ ...containerVarsStyle, ...containerHeightStyle, ...keyboardWidthStyle }}
      role="application"
      aria-label="Virtual Piano"
    >
      <div className="relative w-full h-full">
        {/* Realistic felt strip */}
        <div className="absolute top-0 left-0 right-0 h-2 rounded-t-3xl z-20"
             style={{ background: 'linear-gradient(180deg, #8B0000 0%, #4A0000 100%)', boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.1)' }} />
        {/* White keys grid */}
        <div className="absolute inset-0 grid z-0" style={gridStyle}>
        {whiteKeys.map(({ note, octave: o, localIndex }) => {
          const noteWithOctave = `${note}${o}`;
          const isActive = activeNotesWithOct.has(noteWithOctave);
          const inScaleFlag = inScale(note);
          const keyChar = keyboardLabels?.[noteWithOctave];

          return (
            <div
              key={noteWithOctave}
              className={`
                relative h-full flex flex-col justify-end items-center ${(totalWhiteKeys > 20) ? 'p-1 pb-1' : 'p-2 pb-4'}
                transition-all duration-100 ease-in-out
                ${isActive ? 'text-white' : 'text-gray-700'}
                ${inScaleFlag ? '' : 'opacity-30'}
              `}
              style={{
                  gridColumn: String(localIndex + 1),
                  background: isActive
                    ? 'linear-gradient(180deg, #22d3ee 0%, #0891b2 100%)'
                    : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 30%, #e2e8f0 70%, #cbd5e1 100%)',
                  boxShadow: isActive 
                      ? 'inset 0 3px 6px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255,255,255,0.1), 0 1px 3px rgba(0,0,0,0.2)'
                      : 'inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.15), inset -1px 0 1px rgba(0,0,0,0.1), inset 1px 0 1px rgba(0,0,0,0.1)',
                  borderRadius: '0 0 4px 4px',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderTop: 'none'
              }}
              aria-label={`Piano key ${noteWithOctave}`}
              aria-pressed={isActive}
              onPointerDown={(e) => { (e as any).preventDefault?.(); (e.currentTarget as any).setPointerCapture?.(e.pointerId); handleDown(noteWithOctave);} }
              onPointerUp={() => handleUp(noteWithOctave)}
              onPointerLeave={() => handleUp(noteWithOctave)}
              onPointerEnter={(e) => { if (isMouseDown(e)) handleDown(noteWithOctave); }}
              onPointerCancel={() => handleUp(noteWithOctave)}
            >
              <div className="flex flex-col items-center leading-tight">
                {showLabels && keyChar && (
                  <span className={`${totalWhiteKeys > 30 ? 'text-[6px]' : 'text-[8px]'} text-gray-400 font-extrabold mb-0.5 opacity-100`}>{keyChar}</span>
                )}
                {showLabels && (
                  <span className={`${totalWhiteKeys > 30 ? 'text-[10px]' : 'text-xs'} font-bold`}>{note}</span>
                )}
              </div>
            </div>
          );
        })}
        </div>

        {/* Black keys grid overlay */}
        <div className="absolute inset-0 grid z-10 pointer-events-none" style={gridStyle}>
        {whiteKeys.map(({ note, octave: o, wIndex, localIndex, midi }) => {
          // Do not render a black key beyond last white column (no next column to span)
          if (localIndex >= totalWhiteKeys - 1) return null;
          // Compute the midi of this white key and the next semitone
          const whiteMidi = midi;
          const blackMidi = whiteMidi + 1;
          // Skip where next semitone is not a black key or out of range
          if (!isBlackMidi(blackMidi)) return null;
          // Ensure within configured keyboard range high
          const rangeHi = rangeData.hi;
          if (blackMidi > rangeHi) return null;
          const { note: blackName, octave: bo } = midiToParts(blackMidi);
          const noteWithOctave = `${blackName}${bo}`;
          const isActive = activeNotesWithOct.has(noteWithOctave);
          const inScaleFlag = inScale(blackName);
          const keyChar = keyboardLabels?.[noteWithOctave];

          return (
            <div
              key={noteWithOctave}
              className={`
                relative
                flex flex-col justify-end items-center p-2 pb-3 shadow-lg pointer-events-auto
                transition-all duration-100 ease-in-out
                ${isActive ? 'text-white' : 'text-gray-200'}
                ${inScaleFlag ? '' : 'opacity-40'}
              `}
              style={{
                // span the current white column and the next one so its center is the boundary
                gridColumn: `${localIndex + 1} / span 2`,
                gridRow: '1',
                justifySelf: 'center',
                alignSelf: 'start',
                // width relative to the spanned 2-column area
                width: blackKeyWidth,
                height: blackKeyHeight,
                background: isActive
                  ? 'linear-gradient(180deg, #0891b2 0%, #0e7490 100%)'
                  : 'linear-gradient(180deg, #2d3238 0%, #1a1d23 50%, #0f1114 100%)',
                boxShadow: isActive 
                    ? 'inset 0 3px 8px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(0,0,0,0.3)' 
                    : 'inset 0 1px 1px rgba(255,255,255,0.05), 0 3px 6px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3), inset -1px 0 1px rgba(0,0,0,0.2), inset 1px 0 1px rgba(0,0,0,0.2)',
                borderRadius: '0 0 6px 6px',
                border: '1px solid rgba(0,0,0,0.3)',
                borderTop: 'none'
              }}
              aria-label={`Piano key ${noteWithOctave}`}
              aria-pressed={isActive}
              onPointerDown={(e) => { (e as any).preventDefault?.(); (e.currentTarget as any).setPointerCapture?.(e.pointerId); handleDown(noteWithOctave);} }
              onPointerUp={() => handleUp(noteWithOctave)}
              onPointerLeave={() => handleUp(noteWithOctave)}
              onPointerEnter={(e) => { if (isMouseDown(e)) handleDown(noteWithOctave); }}
              onPointerCancel={() => handleUp(noteWithOctave)}
            >
              <div className="flex flex-col items-center leading-tight">
                {showLabels && keyChar && (
                  <span className={`${totalWhiteKeys > 30 ? 'text-[6px]' : 'text-[8px]'} text-white/60 font-extrabold mb-0.5 opacity-100`}>{keyChar}</span>
                )}
                {showLabels && (
                  <span className={`${totalWhiteKeys > 30 ? 'text-[9px]' : 'text-xs'} font-bold text-gray-100`}>{displayAccidental(blackName)}</span>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
;