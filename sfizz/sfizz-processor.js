//  Copyright 2021 Paul Ferrand

//  Permission is hereby granted, free of charge, to any person obtaining a 
//  copy of this software and associated documentation files (the "Software"), 
//  to deal in the Software without restriction, including without limitation 
//  the rights to use, copy, modify, merge, publish, distribute, sublicense, 
//  and/or sell copies of the Software, and to permit persons to whom the 
//  Software is furnished to do so, subject to the following conditions:
//
//  The above copyright notice and this permission notice shall be included in 
//  all copies or substantial portions of the Software.
//
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS 
//  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
//  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
//  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
//  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
//  DEALINGS IN THE SOFTWARE.

import WASMAudioBuffer from './util/WASMAudioBuffer.js';

// Lazy-load the sfizz Emscripten glue as an ES module using a blob URL to avoid
// cross-origin module quirks in AudioWorklet. We try local first, then upstream raw.
async function loadSfizzGlue() {
  const candidates = [
    new URL('./build/sfizz.wasm.js', import.meta.url).href,
    'https://raw.githubusercontent.com/sfztools/sfizz-webaudio/www/build/sfizz.wasm.js',
  ];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      let code = await res.text();
      // If the glue is a classic script without an ESM default export, append one.
      if (!/export\s+default\s+Module\s*;?$/m.test(code)) {
        code += '\nexport default Module;\n';
      }
      const blob = new Blob([code], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const mod = await import(blobUrl);
      return mod.default;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('Failed to load sfizz glue');
}

// Web Audio API's render block size
const NUM_FRAMES = 128;

class SfizzProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Defer initialization until WASM glue is loaded
    this._ready = false;
    this._synth = null;
    this._leftBuffer = null;
    this._rightBuffer = null;
    this._activeVoices = 0;
    this.port.onmessage = this._handleMessage.bind(this);
    loadSfizzGlue()
      .then((Module) => {
        this._synth = new Module.SfizzWrapper(sampleRate);
        this._leftBuffer = new WASMAudioBuffer(Module, NUM_FRAMES, 1, 1);
        this._rightBuffer = new WASMAudioBuffer(Module, NUM_FRAMES, 1, 1);
        this._ready = true;
        this.port.postMessage({ type: 'sfizz_ready' });
      })
      .catch((e) => {
        // Surface error to main thread for debugging
        this.port.postMessage({ type: 'sfizz_error', message: String(e && e.message || e) });
      });
  }

  process(inputs, outputs) {
    if (!this._ready || !this._synth) {
      // Zero-fill until the engine is ready
      if (outputs && outputs[0] && outputs[0][0]) outputs[0][0].fill(0);
      if (outputs && outputs[1] && outputs[1][0]) outputs[1][0].fill(0);
      return true;
    }
    // Call the render function to fill the WASM buffer. Then clone the
    // rendered data to process() callback's output buffer.
    this._synth.render(this._leftBuffer.getPointer(), this._rightBuffer.getPointer(), NUM_FRAMES);
    outputs[0][0].set(this._leftBuffer.getF32Array());
    outputs[1][0].set(this._rightBuffer.getF32Array());
    const activeVoices = this._synth.numActiveVoices();
    if (activeVoices != this._activeVoices) {
      this.port.postMessage({ activeVoices: this._synth.numActiveVoices() });
      this._activeVoices = activeVoices;
    }
    return true;
  }

  _handleMessage(event) {
    const data = event.data;
    if (!this._ready || !this._synth) return;
    switch (data.type) {
      case 'note_on':
        this._synth.noteOn(0, data.number, data.value);
        break;
      case 'note_off':
        this._synth.noteOff(0, data.number, data.value);
        break;
      case 'cc':
        this._synth.cc(0, data.number, data.value);
        break;
      case 'aftertouch':
        this._synth.aftertouch(0, data.value);
        break;
      case 'pitch_wheel':
        this._synth.pitchWheel(0, data.value);
        break;
      case 'text':
        this._synth.load(data.sfz);
        const usedCCs = this._synth.usedCCs();
        for (let i = 0; i < usedCCs.size(); i++) {
          const cc = usedCCs.get(i);
          var ccLabel = this._synth.ccLabel(cc);
          // Default names
          if (ccLabel == '') {
            switch(cc) {
              case 7: ccLabel = 'Volume'; break;
              case 10: ccLabel = 'Pan'; break;
              case 11: ccLabel = 'Expression'; break;
            }              
          }

          const ccValue = this._synth.ccValue(cc);
          const ccDefault = this._synth.ccDefault(cc);
          this.port.postMessage({ cc: cc, label: ccLabel, value: ccValue, default: ccDefault });
        }
        this.port.postMessage({ numRegions: this._synth.numRegions() });
        break;
      case 'num_regions':
        this.port.postMessage({ numRegions: this._synth.numRegions() });
        break;
      case 'active_voices':
        this.port.postMessage({ activeVoices: this._synth.numActiveVoices() });
        break;
      default:
        console.log("Unknown message: ", event);
    }
  }
}

registerProcessor('sfizz', SfizzProcessor);
