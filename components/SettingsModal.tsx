import React from 'react';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  useFlats: boolean;
  setUseFlats: (v: boolean) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
  scaleName: string;
  setScaleName: (v: string) => void;
  scaleRoot: string;
  setScaleRoot: (v: string) => void;
  scaleOptions: string[];
  noteOptions: string[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  useFlats,
  setUseFlats,
  showLabels,
  setShowLabels,
  scaleName,
  setScaleName,
  scaleRoot,
  setScaleRoot,
  scaleOptions,
  noteOptions,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative w-[90vw] max-w-[720px] rounded-3xl border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.6)] overflow-hidden"
           style={{
             background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.06) 100%)',
             WebkitBackdropFilter: 'blur(30px) saturate(180%)',
             backdropFilter: 'blur(30px) saturate(180%)'
           }}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Settings</h2>
            <button onClick={onClose} className="text-white/70 hover:text-white transition">✕</button>
          </div>

          {/* Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Keyboard labels and flats */}
            <section className="p-4 rounded-2xl bg-white/[0.06] border border-white/[0.08]">
              <h3 className="text-sm font-medium text-white/80 mb-3">Keyboard</h3>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-white/60">Show Key & Note Labels</span>
                <div 
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 cursor-pointer ${showLabels ? 'bg-cyan-400' : 'bg-white/20'}`}
                  onClick={() => setShowLabels(!showLabels)}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${showLabels ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-white/60">Use Flats</span>
                <div 
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 cursor-pointer ${useFlats ? 'bg-cyan-400' : 'bg-white/20'}`}
                  onClick={() => setUseFlats(!useFlats)}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${useFlats ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </div>
              </div>
            </section>

            {/* Scale */}
            <section className="p-4 rounded-2xl bg-white/[0.06] border border-white/[0.08]">
              <h3 className="text-sm font-medium text-white/80 mb-3">Scale Helper</h3>
              <label className="block text-xs text-white/60 mb-1">Scale</label>
              <select
                value={scaleName}
                onChange={(e) => setScaleName(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm focus:border-white/40 outline-none"
              >
                {scaleOptions.map((s) => (
                  <option key={s} value={s} className="bg-gray-800">{s}</option>
                ))}
              </select>

              <label className="block text-xs text-white/60 mb-2 mt-3">Root</label>
              <select
                value={scaleRoot}
                onChange={(e) => setScaleRoot(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm focus:border-white/40 outline-none"
              >
                {noteOptions.map((n) => (
                  <option key={n} value={n} className="bg-gray-800">{n}</option>
                ))}
              </select>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
