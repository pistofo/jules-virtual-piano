import type { KeyMapEntry } from './types';

export const KEY_CODE_TO_NOTE_MAP: Record<string, KeyMapEntry> = {
  // White keys (bottom row, based on physical QWERTY layout)
  'KeyA': { note: 'C', octaveOffset: 0 },
  'KeyS': { note: 'D', octaveOffset: 0 },
  'KeyD': { note: 'E', octaveOffset: 0 },
  'KeyF': { note: 'F', octaveOffset: 0 },
  'KeyG': { note: 'G', octaveOffset: 0 },
  'KeyH': { note: 'A', octaveOffset: 0 },
  'KeyJ': { note: 'B', octaveOffset: 0 },
  'KeyK': { note: 'C', octaveOffset: 1 },
  'KeyL': { note: 'D', octaveOffset: 1 },
  'Semicolon': { note: 'E', octaveOffset: 1 },

  // Black keys (top row, based on physical QWERTY layout)
  'KeyW': { note: 'C#', octaveOffset: 0 },
  'KeyE': { note: 'D#', octaveOffset: 0 },
  'KeyT': { note: 'F#', octaveOffset: 0 },
  'KeyY': { note: 'G#', octaveOffset: 0 },
  'KeyU': { note: 'A#', octaveOffset: 0 },
  'KeyO': { note: 'C#', octaveOffset: 1 },
  'KeyP': { note: 'D#', octaveOffset: 1 },
};

// All notes in an octave
export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const OCTAVE_RANGE = [1, 8];

// Keyboard size presets mapped to realistic ranges used by common MIDI keyboards
export type KeyboardSize = 88;
export const KEYBOARD_RANGES: Record<KeyboardSize, { low: string; high: string }> = {
  88: { low: 'A0', high: 'C8' }, // full piano only
};