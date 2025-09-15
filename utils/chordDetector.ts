// This is a TypeScript port inspired by the pizmidi "midiChordAnalyzer".
// It finds a canonical stacked form via a minimum-energy search on pitch classes
// and matches interval patterns against an extensive chord database.

const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTES  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// --- Music Theory Helpers ---

const noteToMidi = (note: string): number => {
    const match = note.match(/^([A-G]#?)([0-9])$/);
    if (!match) return -1;
    const [, name, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const noteIndex = SHARP_NOTES.indexOf(name);
    return 12 * (octave + 1) + noteIndex;
};

const midiToNoteName = (midi: number, useSharps = true): string => {
    // Use sharps by default, ensure positive modulo
    const noteIndex = ((midi % 12) + 12) % 12;
    return (useSharps ? SHARP_NOTES : FLAT_NOTES)[noteIndex];
};

const getIntervalName = (semitones: number): string | null => {
    let diff = Math.abs(semitones);
    while (diff > 21) diff -= 12;
    switch (diff) {
        case 0: return "Unison";
        case 1: return "Minor 2nd";
        case 2: return "Major 2nd";
        case 3: return "Minor 3rd";
        case 4: return "Major 3rd";
        case 5: return "Perfect 4th";
        case 6: return "Tritone";
        case 7: return "Perfect 5th";
        case 8: return "Minor 6th (or #5)";
        case 9: return "Major 6th";
        case 10: return "Minor 7th";
        case 11: return "Major 7th";
        case 12: return "Octave";
        case 13: return "Flat 9th";
        case 14: return "9th";
        case 15: return "Minor 10th (or #9)";
        case 16: return "Major 10th";
        case 17: return "11th";
        case 18: return "Augmented 11th";
        case 19: return "Perfect 12th";
        case 20: return "Flat 13th";
        case 21: return "13th";
        default: return null;
    }
};

// --- Permutation and Stacking Logic ---

function* permutations<T>(array: T[], n: number = array.length): Generator<T[]> {
    if (n <= 1) {
        yield array.slice();
        return;
    }
    for (let i = 0; i < n; i++) {
        yield* permutations(array, n - 1);
        const j = n % 2 ? 0 : i;
        [array[n - 1], array[j]] = [array[j], array[n - 1]];
    }
}

const getIntervalPattern = (chord: number[]): number[] => {
    const pattern: number[] = [];
    if (chord.length < 2) return [0];
    for (let i = 0; i < chord.length - 1; i++) {
        let interval = chord[i + 1] - chord[i];
        while (interval < 0) interval += 12;
        pattern.push(interval);
    }
    return pattern;
};

const getAsStackedChord = (noteClasses: number[]): number[] => {
    if (noteClasses.length <= 1) return noteClasses;

    let minEnergy = -1;
    let minEnergyChords: { chord: number[], patternStr: string }[] = [];

    for (const p of permutations([...noteClasses])) {
        const pattern = getIntervalPattern(p);
        const energy = pattern.reduce((sum, val) => sum + val, 0);

        if (energy < minEnergy || minEnergy === -1) {
            minEnergy = energy;
            minEnergyChords = [{ chord: p, patternStr: pattern.join(',') }];
        } else if (energy === minEnergy) {
            minEnergyChords.push({ chord: p, patternStr: pattern.join(',') });
        }
    }

    minEnergyChords.sort((a, b) => a.patternStr.localeCompare(b.patternStr));
    return minEnergyChords[0].chord;
};

// --- Chord Database and Detection ---

interface ChordFormula {
    name: string;
    pattern: string;
    rootIndex: number;
}

const CHORD_FORMULAS: ChordFormula[] = [];

const defineChord = (name: string, noteStr: string) => {
    const notes = noteStr.split(',').map(n => SHARP_NOTES.indexOf(
        n.toUpperCase()
         .replace('B#','C')
         .replace('E#','F')
         .replace('FB','E')
         .replace('CB','B')
         .replace('DB','C#')
         .replace('EB','D#')
         .replace('GB','F#')
         .replace('AB','G#')
         .replace('BB','A#')
    ));
    const stacked = getAsStackedChord(notes);
    const rootNote = notes[0];
    const rootIndex = stacked.indexOf(rootNote);
    const pattern = getIntervalPattern(stacked).join(',');
    CHORD_FORMULAS.push({ name, pattern, rootIndex });
}

// Ported (subset) from pizmidi fillChordDatabase()
defineChord("", "c,e,g");
defineChord("5", "c,g");
defineChord("6(no3)", "c,g,a");
defineChord("Maj7", "c,e,g,b");
defineChord("Maj7(#11)", "c,e,f#,b");
defineChord("add9", "c,e,g,d");
defineChord("Maj7(9)", "c,d,e,b");
defineChord("6(9)", "c,d,e,a");
defineChord("+", "c,e,g#");
defineChord("m", "c,eb,g");
defineChord("madd9", "c,eb,g,d");
defineChord("m7", "c,eb,g,bb");
defineChord("m7(9)", "c,d,eb,bb");
defineChord("mMaj7", "c,eb,g,b");
defineChord("mMaj7(9)", "c,d,eb,b");
defineChord("dim", "c,eb,f#");
defineChord("dim7", "c,eb,f#,a");
defineChord("7", "c,e,g,bb");
defineChord("7(no5)", "c,e,bb");
defineChord("7sus4", "c,f,g,bb");
defineChord("7(b5)", "c,e,f#,bb");
defineChord("7(9)", "c,d,e,bb");
defineChord("7(13)", "c,e,a,bb");
defineChord("7(b9)", "c,c#,e,bb");
defineChord("+7", "c,e,g#,bb");
defineChord("7(#9)", "c,eb,e,bb");
defineChord("sus4", "c,f,g");
defineChord("6add9", "c,e,g,a,d");
defineChord("Maj9", "c,e,g,b,d");
defineChord("9", "c,e,g,bb,d");
defineChord("13", "c,e,g,bb,d,a");
defineChord("13", "c,e,g,bb,d,f,a");
defineChord("13", "c,e,bb,d,a");
defineChord("m6", "c,eb,g,a");
defineChord("m6add9", "c,eb,g,a,d");
defineChord("m6/9", "c,eb,a,d");
defineChord("m7add13", "c,eb,g,a,bb");
defineChord("m9", "c,eb,g,bb,d");
defineChord("m11", "c,eb,g,bb,d,f");
defineChord("m11", "c,eb,bb,d,f");
defineChord("m13", "c,eb,g,bb,d,f,a");
defineChord("m9/Maj7", "c,eb,g,b,d");
defineChord("m9(b5)", "c,eb,gb,bb,d");
defineChord("m11(b5)", "c,eb,gb,bb,d,f");
defineChord("Maj7(#5)", "c,e,g#,b");
defineChord("Maj7(#11)", "c,e,g,b,f#");
defineChord("Maj9(#11)", "c,e,g,b,d,f#");
defineChord("7(b9)", "c,e,g,bb,db");
defineChord("7(#9)", "c,e,g,bb,d#");
defineChord("7(#5)(#9)", "c,e,g#,bb,d#");
defineChord("7(#11)", "c,e,g,bb,f#");
defineChord("9(#11)", "c,e,g,bb,d,f#");
defineChord("7(b9)(#11)", "c,e,g,bb,db,f#");
defineChord("13b5", "c,e,gb,bb,d,a");
defineChord("13b5", "c,e,gb,bb,d,f,a");
defineChord("13b9", "c,e,g,bb,db,a");
defineChord("13b9", "c,e,g,bb,db,f,a");
defineChord("13#11", "c,e,g,bb,d,f#,a");
defineChord("7(no3)", "c,g,bb");
defineChord("Maj7(no5)", "c,e,b");

// --- Main Detection Function ---

export const detectChord = (notes: string[], opts?: { useFlats?: boolean }): string | null => {
    if (!notes || notes.length === 0) {
        return null;
    }

    const midiNotes = notes.map(noteToMidi).sort((a, b) => a - b);
    const bassNote = midiNotes[0];
    const useSharps = !(opts?.useFlats);

    if (midiNotes.length === 1) {
        return midiToNoteName(bassNote, useSharps);
    }
    
    if (midiNotes.length === 2) {
        const name = getIntervalName(midiNotes[1] - midiNotes[0]) || "Interval";
        return `${name} (${midiToNoteName(midiNotes[0], useSharps)}, ${midiToNoteName(midiNotes[1], useSharps)})`;
    }
    
    const noteClasses = [...new Set(midiNotes.map(n => n % 12))];
    if (noteClasses.length >= 9) {
        return `${midiToNoteName(bassNote, useSharps)} Note Soup`;
    }
    const stackedChord = getAsStackedChord(noteClasses);
    const pattern = getIntervalPattern(stackedChord).join(',');

    for (const formula of CHORD_FORMULAS) {
        if (formula.pattern === pattern) {
            let rootNote = stackedChord[formula.rootIndex];
            const bassNoteClass = bassNote % 12;
            if (formula.name === "dim7" || formula.name === "+") {
                rootNote = bassNoteClass;
            }
            let chordName = midiToNoteName(rootNote, useSharps) + formula.name;
            if (rootNote !== bassNoteClass) {
                chordName += "/" + midiToNoteName(bassNoteClass, useSharps);
            }
            return chordName;
        }
    }

    return `(${[...noteClasses].map(n => (useSharps ? SHARP_NOTES[n] : FLAT_NOTES[n])).join(', ')})`;
};

// Initialize chord database on load
if (CHORD_FORMULAS.length === 0) {
    // Call with a few more definitions found in the C++ code for more accuracy
    defineChord("m(maj9)", "c,d#,g,b,d");
    defineChord("m7(b9)", "c,d#,g,a#,c#");
    defineChord("Maj7(#5)", "c,e,g#,b");
}
