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
  selGamma?: number; // optional gamma curve for selection; 1.0 = linear
  selectCurve?: (x: number) => number; // optional explicit curve (overrides selGamma)
  selInvert?: boolean; // optional, invert selection (1-x)
};

// A tiny wrapper that mimics the bits of Tone.Sampler we use.
export class MultiLayerSampler {
  private layers: { def: VelocityLayer; sampler: Tone.Sampler; ready: boolean }[] = [];
  private noteLayerMap: Map<string, number> = new Map();
  private onload?: () => void;
  private output: Tone.Gain;
  public readonly isMulti: boolean = true;
  private selectCurve: (x: number) => number;
  private selInvert: boolean;

  constructor(cfg: MultiLayerConfig) {
    const release = cfg.release ?? 2.0;
    this.onload = cfg.onload;
    this.output = new Tone.Gain(cfg.gain ?? 0.5); // default -6 dB to prevent clipping
    const gamma = cfg.selGamma ?? 1.0;
    this.selectCurve = cfg.selectCurve ?? ((x: number) => Math.pow(Math.max(0, Math.min(1, x)), gamma));
    this.selInvert = Boolean(cfg.selInvert);

    let remaining = cfg.layers.length;
    this.layers = cfg.layers.map((def) => {
      const sampler = new Tone.Sampler({
        urls: def.urls,
        release,
        // Match the Salamander piano's natural decay behavior
        attack: 0.01,
        curve: "exponential", // Natural decay curve
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
    // Use Tone's helper to ensure proper AudioNode/ToneAudioNode bridging
    this.output.toDestination();
    return this;
  }

  connect(dest: any) {
    // Be resilient to both ToneAudioNode and native AudioNode destinations
    const target: any = (dest && (dest as any).input) ? (dest as any).input : dest;
    // @ts-ignore - Tone types
    this.output.connect(target);
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
    const selRaw = typeof velocity === 'number' ? velocity : velocity.sel;
    let sel = this.selectCurve(selRaw);
    if (this.selInvert) sel = 1 - sel;
    
    // DAW-style crossfading: find overlapping layers and blend them
    const activeLayerIds: number[] = [];
    const layerGains: number[] = [];
    
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i].def;
      if (sel >= layer.min && sel <= layer.max) {
        activeLayerIds.push(i);
        
        // Calculate crossfade gain based on position in layer range
        let gain = 1.0;
        const layerRange = layer.max - layer.min;
        if (layerRange > 0) {
          const posInLayer = (sel - layer.min) / layerRange;
          // Simple linear crossfade - could be made more sophisticated
          if (i > 0 && sel <= layer.min + layerRange * 0.3) {
            // Fade in from previous layer
            gain = posInLayer / 0.3;
          } else if (i < this.layers.length - 1 && sel >= layer.max - layerRange * 0.3) {
            // Fade out to next layer
            gain = 1.0 - ((sel - (layer.max - layerRange * 0.3)) / (layerRange * 0.3));
          }
        }
        layerGains.push(gain * amp);
      }
    }
    
    // Play all active layers with calculated gains
    if (activeLayerIds.length > 0) {
      this.noteLayerMap.set(note, activeLayerIds[0]); // Track primary layer for release
      for (let i = 0; i < activeLayerIds.length; i++) {
        const layerId = activeLayerIds[i];
        const layerGain = layerGains[i];
        this.layers[layerId].sampler.triggerAttack(note, time, layerGain);
      }
    } else {
      // Fallback to closest layer
      const idx = this.pickLayer(sel);
      const layer = this.layers[idx];
      this.noteLayerMap.set(note, idx);
      layer.sampler.triggerAttack(note, time, amp);
    }
  }

  triggerRelease(note: string, time?: number) {
    // With crossfading, multiple layers might be playing - release all of them
    this.layers.forEach((l) => l.sampler.triggerRelease(note, time));
    this.noteLayerMap.delete(note);
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

  // Fix velocity mapping - high velocity should trigger hard samples
  return [
    { name: 'soft', min: 0.0, max: 0.4, urls: soft },
    { name: 'mid',  min: 0.3, max: 0.7, urls: mid },
    { name: 'hard', min: 0.6, max: 1.0, urls: hard },
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
