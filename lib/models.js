// i2R CNC Machine Model Detection

export const MODEL_DEFINITIONS = [
  // A Series
  { display: "A.22", series: "A", patterns: ["a.22", "a22", "a 22"] },
  { display: "A.23", series: "A", patterns: ["a.23", "a23", "a 23"] },
  { display: "A.24", series: "A", patterns: ["a.24", "a24", "a 24"] },
  { display: "A.42", series: "A", patterns: ["a.42", "a42", "a 42"] },
  { display: "A.44", series: "A", patterns: ["a.44", "a44", "a 44"] },

  // W Series
  { display: "W.42", series: "W", patterns: ["w.42", "w42", "w 42"] },

  // B Series — also known as i2R number series
  { display: "B.22", series: "B", alias: "i2R 4",  patterns: ["b.22", "b22", "b 22", "i2r 4", "i2r-4", "i2r4", "i2r4s"] },
  { display: "B.23", series: "B", alias: "i2R 6",  patterns: ["b.23", "b23", "b 23", "i2r 6", "i2r-6", "i2r6", "i2r6s"] },
  { display: "B.24", series: "B", alias: "i2R 8",  patterns: ["b.24", "b24", "b 24", "i2r 8", "i2r-8", "i2r8", "i2r8s", "i2r 8s"] },

  // C Series
  { display: "C.22", series: "C", patterns: ["c.22", "c22", "c 22"] },
  { display: "C.24", series: "C", patterns: ["c.24", "c24", "c 24"] },
  { display: "C.44", series: "C", patterns: ["c.44", "c44", "c 44"] },
  { display: "C.48", series: "C", patterns: ["c.48", "c48", "c 48"] },

  // D Series
  { display: "D.11", series: "D", patterns: ["d.11", "d11", "d 11"] },
  { display: "D.21", series: "D", patterns: ["d.21", "d21", "d 21"] },
  { display: "D.22", series: "D", patterns: ["d.22", "d22", "d 22"] },
  { display: "D.24", series: "D", patterns: ["d.24", "d24", "d 24"] },
  { display: "D.44", series: "D", patterns: ["d.44", "d44", "d 44"] },

  // E Series
  { display: "E.24", series: "E", patterns: ["e.24", "e24", "e 24"] },
  { display: "E.44", series: "E", patterns: ["e.44", "e44", "e 44"] },
  { display: "E.55", series: "E", patterns: ["e.55", "e55", "e 55"] },

  // G Series
  { display: "G.48", series: "G", patterns: ["g.48", "g48", "g 48"] },

  // M Series
  { display: "M.22", series: "M", patterns: ["m.22", "m22", "m 22"] },

  // M+ Series
  { display: "M+450P", series: "M+", patterns: ["m+450p", "m+ 450p", "m+450", "450p"] },
  { display: "M+350",  series: "M+", patterns: ["m+350",  "m+ 350"] },
];

export const ALL_SERIES = ["A", "W", "B", "C", "D", "E", "G", "M+", "M"];
export const ALL_MODELS = MODEL_DEFINITIONS.map(m => m.display);

// Returns { display, alias } or null
export function detectMachineModelFull(text) {
  if (!text) return null;
  const s = " " + text.toLowerCase() + " ";

  const sorted = MODEL_DEFINITIONS.flatMap(def =>
    def.patterns.map(p => ({ display: def.display, alias: def.alias || null, series: def.series, pattern: p }))
  ).sort((a, b) => b.pattern.length - a.pattern.length);

  for (const { display, alias, pattern } of sorted) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
    if (regex.test(s)) return { display, alias };
  }

  // Series-level fallback
  for (const series of ALL_SERIES) {
    const regex = new RegExp(`(?<![a-z])${series.toLowerCase().replace("+", "\\+")}[\\s\\-]series`, "i");
    if (regex.test(s)) return { display: `${series} series`, alias: null };
  }

  return null;
}

// Normalize any model string to the canonical display format
// Handles AI returning "i2R 8", "i2r8", "B24" etc. and converts to "B.24"
export function normalizeModel(raw) {
  if (!raw) return null;
  // First try direct pattern detection from the raw string
  const detected = detectMachineModel(raw);
  if (detected) return detected;
  // Fallback: check migration map for common aliases
  const ALIASES = {
    "i2r-4":"B.22","i2r 4":"B.22","i2r4":"B.22",
    "i2r-6":"B.23","i2r 6":"B.23","i2r6":"B.23",
    "i2r-8":"B.24","i2r 8":"B.24","i2r8":"B.24",
    "i2r8s":"B.24","i2r 8s":"B.24","i2r-8s":"B.24",
    "b24":"B.24","b22":"B.22","b23":"B.23",
  };
  return ALIASES[raw.toLowerCase().trim()] || raw;
}

// Legacy — returns just the display string for backwards compatibility
export function detectMachineModel(text) {
  const result = detectMachineModelFull(text);
  return result ? result.display : null;
}

// Format model tag label: "B.24 (i2R 8)" or just "A.24"
export function formatModelLabel(display, alias) {
  if (!display) return null;
  if (alias) return `${display} (${alias})`;
  return display;
}
