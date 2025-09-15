// Fix: Add type definitions for the experimental Keyboard API to resolve TypeScript errors.
declare global {
  interface KeyboardLayoutMap extends ReadonlyMap<string, string> {}
  interface Keyboard extends EventTarget {
    getLayoutMap(): Promise<KeyboardLayoutMap>;
  }
  interface Navigator {
    readonly keyboard?: Keyboard;
  }
}

export type KeyMapEntry = { note: string; octaveOffset: number };
