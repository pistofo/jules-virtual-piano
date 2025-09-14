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

// Inlined WASMAudioBuffer (AudioWorklet cannot reliably use static imports across
// all browsers/servers). This is adapted from ./util/WASMAudioBuffer.js
const BYTES_PER_UNIT = Uint16Array.BYTES_PER_ELEMENT;
const BYTES_PER_SAMPLE = Float32Array.BYTES_PER_ELEMENT;
const MAX_CHANNEL_COUNT = 32;
class WASMAudioBuffer {
  constructor(wasmModule, length, channelCount, maxChannelCount) {
    this._isInitialized = false;
    this._module = wasmModule;
    this._length = length;
    this._maxChannelCount = maxChannelCount ? Math.min(maxChannelCount, MAX_CHANNEL_COUNT) : channelCount;
    this._channelCount = channelCount;
    this._allocateHeap();
    this._isInitialized = true;
  }
  _allocateHeap() {
    const channelByteSize = this._length * BYTES_PER_SAMPLE;
    const dataByteSize = this._channelCount * channelByteSize;
    this._dataPtr = this._module._malloc(dataByteSize);
    this._channelData = [];
    for (let i = 0; i < this._channelCount; ++i) {
      let startByteOffset = this._dataPtr + i * channelByteSize;
      let endByteOffset = startByteOffset + channelByteSize;
      this._channelData[i] = this._module.HEAPF32.subarray(startByteOffset >> BYTES_PER_UNIT, endByteOffset >> BYTES_PER_UNIT);
    }
  }
  adaptChannel(newChannelCount) { if (newChannelCount < this._maxChannelCount) this._channelCount = newChannelCount; }
  get length() { return this._isInitialized ? this._length : null; }
  get numberOfChannels() { return this._isInitialized ? this._channelCount : null; }
  get maxChannelCount() { return this._isInitialized ? this._maxChannelCount : null; }
  getChannelData(channelIndex) { if (channelIndex >= this._channelCount) return null; return typeof channelIndex === 'undefined' ? this._channelData : this._channelData[channelIndex]; }
  getF32Array() { return this._channelData[0]; }
  getPointer() { return this._dataPtr; }
  free() { this._isInitialized = false; this._module._free(this._dataPtr); this._module._free(this._pointerArrayPtr); this._channelData = null; }
}

// Build a module URL for the Emscripten glue from provided source and inject
// the wasm bytes so the glue does not try to fetch() in the AudioWorklet.
function buildGlueModuleUrl(glueSource, wasmBytes) {
  // Expose a preset Module via the global so the glue will reuse it instead of creating a new one.
  // We also ensure an ESM default export at the end.
  const prefix = 'var Module = (globalThis.__sfizzModule || {});\n';
  const suffix = '\nexport default Module;\n';
  return URL.createObjectURL(new Blob([prefix, glueSource, suffix], { type: 'text/javascript' }));
}

// Web Audio API's render block size
const NUM_FRAMES = 128;

class SfizzProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Defer initialization until WASM glue is loaded
    this._ready = false;
    this._synth = null;
    this._leftBuffer = null;
    this._rightBuffer = null;
    this._activeVoices = 0;
    this.port.onmessage = this._handleMessage.bind(this);
    try {
      const glueSource = options?.processorOptions?.glueSource;
      const wasmBytes = options?.processorOptions?.wasmBytes; // Uint8Array
      if (!glueSource || !wasmBytes) {
        throw new Error('Missing glueSource or wasmBytes');
      }
      // Seed Module with the binary so the glue will instantiate without network
      globalThis.__sfizzModule = { wasmBinary: wasmBytes, locateFile: (p) => p };
      const moduleUrl = buildGlueModuleUrl(glueSource, wasmBytes);
      import(moduleUrl)
        .then((mod) => mod.default)
        .then((Module) => {
          this._synth = new Module.SfizzWrapper(sampleRate);
          this._leftBuffer = new WASMAudioBuffer(Module, NUM_FRAMES, 1, 1);
          this._rightBuffer = new WASMAudioBuffer(Module, NUM_FRAMES, 1, 1);
          this._ready = true;
          this.port.postMessage({ type: 'sfizz_ready' });
        })
        .catch((e) => this.port.postMessage({ type: 'sfizz_error', message: String(e && e.message || e) }));
    } catch (e) {
      this.port.postMessage({ type: 'sfizz_error', message: String(e && e.message || e) });
    }
  }

  process(inputs, outputs) {
    if (!this._ready || !this._synth) {
      // Zero-fill until the engine is ready
      if (outputs && outputs[0] && outputs[0][0]) outputs[0][0].fill(0);
      if (outputs && outputs[0] && outputs[0][1]) outputs[0][1].fill(0);
      // Legacy two-mono-outputs fallback
      if (outputs && outputs[1] && outputs[1][0]) outputs[1][0].fill(0);
      return true;
    }
    // Call the render function to fill the WASM buffer. Then clone the
    // rendered data to process() callback's output buffer.
    this._synth.render(this._leftBuffer.getPointer(), this._rightBuffer.getPointer(), NUM_FRAMES);
    // Prefer a single 2-channel output
    if (outputs && outputs[0]) {
      if (outputs[0][0]) outputs[0][0].set(this._leftBuffer.getF32Array());
      if (outputs[0][1]) outputs[0][1].set(this._rightBuffer.getF32Array());
    } else if (outputs && outputs[1]) {
      // Fallback: two separate mono outputs
      if (outputs[0] && outputs[0][0]) outputs[0][0].set(this._leftBuffer.getF32Array());
      if (outputs[1] && outputs[1][0]) outputs[1][0].set(this._rightBuffer.getF32Array());
    }
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
