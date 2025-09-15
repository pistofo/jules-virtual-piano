import React, { useEffect, useMemo, useState } from 'react';
import { Piano } from './components/Piano';
import { usePiano } from './hooks/usePiano';
import { NOTES } from './constants';
import { SettingsModal } from './components/SettingsModal';


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
    octaveHintDown,
    octaveHintUp,
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
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Octave hints now provided by usePiano based on actual layout mapping

  // Mobile guard: disable the app entirely on mobile (coarse pointer)
  useEffect(() => {
    const update = () => {
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(Boolean(coarse));
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
    };
  }, []);

  // Removed auto-start-on-gesture; user must click overlay to start audio

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
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-slate-900 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden" style={{fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>
      {!isMobile && !isAudioContextStarted && (
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

      {isMobile && (
        <div 
          className="absolute inset-0 bg-gray-900/85 backdrop-blur-sm flex justify-center items-center z-50"
          role="dialog"
          aria-label="Mobile Not Supported"
        >
          <div className="text-center px-8">
            <p className="px-8 py-4 bg-white/10 rounded-2xl text-white text-lg font-semibold shadow-xl border border-white/10">
              Mobile devices are not supported. Please use a desktop browser.
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-[95vw] mx-auto flex flex-col items-center relative z-10">
        <header className="text-center mb-6">
          <h1 className="text-[28px] md:text-[34px] font-bold tracking-tight text-white mb-1" style={{fontWeight: 700}}>
            Jules' Virtual Piano
          </h1>
          <p className="text-[15px] text-white/60" style={{fontWeight: 400}}>
            Real‑time chord recognition included
          </p>
        </header>
        
        {/* Chord display */}
        <div className="w-full flex justify-center mb-6">
          <div className="px-8 py-5 bg-white/[0.08] backdrop-blur-2xl border border-white/[0.08] rounded-3xl shadow-2xl w-[640px] md:w-[800px] max-w-[90vw]" style={{backdropFilter: 'blur(40px) saturate(180%)', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>
            <div className="flex items-center justify-center">
              <span className="text-[24px] md:text-[32px] font-semibold text-white tracking-wide min-w-0 truncate" style={{fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>
                {detectedChord || '♪'}
              </span>
            </div>
          </div>
        </div>

        {/* iOS-style piano container */}
        <div className="relative mx-auto" style={{ width: 'fit-content' }}>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30 rounded-3xl"></div>
          <div className="relative bg-white/[0.05] backdrop-blur-2xl rounded-3xl border border-white/[0.08] shadow-[0_32px_80px_rgba(0,0,0,0.5)] overflow-hidden" style={{backdropFilter: 'blur(40px) saturate(180%)'}}>
            <Piano 
              activeNotes={activeNotes}
              octave={octave}
              isLoaded={isLoaded}
              velocity={velocity}
              onPlay={playMouseNote}
              onStop={stopMouseNote}
              scaleNotes={scaleNotes}
              keyboardLabels={keyboardLabels}
              showLabels={showLabels}
              keyboardSize={88}
              useFlats={useFlats}
            />
          </div>
        </div>

        {/* Unified horizontal controls toolbar below keyboard */}
        <div className="w-full mx-auto mt-6">
          <div className="w-full flex items-center gap-1 flex-nowrap px-1 py-1 justify-center overflow-visible">

            {/* Octave */}
            <div className="flex h-12 items-center gap-2 px-4 bg-white/[0.08] backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-xl flex-none" style={{backdropFilter: 'blur(40px) saturate(180%)', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>
              <span className="text-[12px] text-white/70 font-medium" style={{fontWeight: 500}}>Octave</span>
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 transition-all text-[15px] font-semibold text-white" onClick={()=>setOctave(o => Math.max(1, o-1))} style={{fontWeight: 600}}>−</button>
                <span className="font-semibold w-8 text-center text-white text-[17px]" style={{fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>C{octave - 1}</span>
                <button className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 transition-all text-[15px] font-semibold text-white" onClick={()=>setOctave(o => Math.min(8, o+1))} style={{fontWeight: 600}}>+</button>
              </div>
              <span className="text-[10px] text-white/50 font-medium">({octaveHintDown}/{octaveHintUp})</span>
            </div>

            {/* Velocity (Ableton-style steps) */}
            <div className="flex h-12 items-center gap-2 px-4 bg-white/[0.08] backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-xl flex-none" style={{backdropFilter: 'blur(40px) saturate(180%)', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>
              <span className="text-[12px] text-white/70 font-medium" style={{fontWeight: 500}}>Velocity</span>
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 transition-all text-[15px] font-semibold text-white" onClick={()=>{
                  const STEPS = [1,20,40,60,80,100,127];
                  setVelocity(v => {
                    const idx = STEPS.findIndex(s => s === v);
                    return idx > 0 ? STEPS[idx-1] : STEPS[0];
                  });
                }} style={{fontWeight: 600}}>−</button>
                <span className="font-semibold w-10 text-center text-white text-[15px]" style={{fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>{velocity}</span>
                <button className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 transition-all text-[15px] font-semibold text-white" onClick={()=>{
                  const STEPS = [1,20,40,60,80,100,127];
                  setVelocity(v => {
                    const idx = STEPS.findIndex(s => s === v);
                    return (idx >= 0 && idx < STEPS.length - 1) ? STEPS[idx+1] : STEPS[STEPS.length-1];
                  });
                }} style={{fontWeight: 600}}>+</button>
              </div>
              <span className="text-[10px] text-white/50 font-medium">(C/V)</span>
            </div>

            {/* Transpose */}
            <div className="flex h-12 items-center gap-2 px-4 bg-white/[0.08] backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-xl flex-none" style={{backdropFilter: 'blur(40px) saturate(180%)', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>
              <span className="text-[12px] text-white/70 font-medium" style={{fontWeight: 500}}>Transpose</span>
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 transition-all text-[15px] font-semibold text-white" onClick={()=>setTranspose(t => Math.max(-12, t-1))} style={{fontWeight: 600}}>−</button>
                <span className="font-semibold w-8 text-center text-white text-[15px]" style={{fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>{transpose > 0 ? '+' : ''}{transpose}</span>
                <button className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 transition-all text-[15px] font-semibold text-white" onClick={()=>setTranspose(t => Math.min(12, t+1))} style={{fontWeight: 600}}>+</button>
              </div>
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-white/15 mx-1 flex-none" aria-hidden="true"></div>

            {/* Sustain */}
            <div className="flex h-12 items-center gap-2 px-4 bg-white/[0.08] backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-xl flex-none" style={{backdropFilter: 'blur(40px) saturate(180%)', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif'}}>
              <span className="text-[12px] text-white/70 font-medium" style={{fontWeight: 500}}>Sustain</span>
              <div className={`w-7 h-7 rounded-full border-2 transition-all duration-300 ${isSustain ? 'bg-white border-white shadow-[0_0_16px_rgba(255,255,255,0.5)]' : 'border-white/30'}`}>
                <div className={`w-full h-full rounded-full transition-all duration-300 ${isSustain ? 'animate-pulse' : ''}`}></div>
              </div>
              <span className="text-[10px] text-white/50 font-medium">(Space)</span>
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-white/15 mx-1 flex-none" aria-hidden="true"></div>

            {/* Settings */}
            <button
              className="h-12 px-4 bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-xl text-white text-[12px] font-medium"
              style={{fontWeight: 500}}
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </button>
          </div>
        </div>
      </div>
      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        useFlats={useFlats}
        setUseFlats={setUseFlats}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        scaleName={scaleName}
        setScaleName={setScaleName}
        scaleRoot={scaleRoot}
        setScaleRoot={setScaleRoot}
        scaleOptions={Object.keys(SCALE_DEFS)}
        noteOptions={NOTES}
      />
    </div>
  );
}

export default App;