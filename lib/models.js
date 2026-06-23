// i2R CNC Machine Model Detection
// Detects model names from email text, including aliases and common customer shorthand

// Master model list with all known aliases
export const MODEL_DEFINITIONS = [
  // A Series
  { display: "A.22", series: "A", patterns: ["a.22", "a22"] },
  { display: "A.23", series: "A", patterns: ["a.23", "a23"] },
  { display: "A.24", series: "A", patterns: ["a.24", "a24"] },
  { display: "A.42", series: "A", patterns: ["a.42", "a42"] },
  { display: "A.44", series: "A", patterns: ["a.44", "a44"] },

  // W Series
  { display: "W.42", series: "W", patterns: ["w.42", "w42"] },

  // B Series (also known as i2R number series)
  { display: "B.22", series: "B", patterns: ["b.22", "b22", "i2r 4", "i2r-4", "i2r4"] },
  { display: "B.23", series: "B", patterns: ["b.23", "b23", "i2r 6", "i2r-6", "i2r6"] },
  { display: "B.24", series: "B", patterns: ["b.24", "b24", "i2r 8", "i2r-8", "i2r8"] },

  // C Series
  { display: "C.22", series: "C", patterns: ["c.22", "c22"] },
  { display: "C.24", series: "C", patterns: ["c.24", "c24"] },
  { display: "C.44", series: "C", patterns: ["c.44", "c44"] },
  { display: "C.48", series: "C", patterns: ["c.48", "c48"] },

  // D Series
  { display: "D.11", series: "D", patterns: ["d.11", "d11"] },
  { display: "D.21", series: "D", patterns: ["d.21", "d21"] },
  { display: "D.22", series: "D", patterns: ["d.22", "d22"] },
  { display: "D.24", series: "D", patterns: ["d.24", "d24"] },
  { display: "D.44", series: "D", patterns: ["d.44", "d44"] },

  // E Series
  { display: "E.24", series: "E", patterns: ["e.24", "e24"] },
  { display: "E.44", series: "E", patterns: ["e.44", "e44"] },
  { display: "E.55", series: "E", patterns: ["e.55", "e55"] },

  // G Series
  { display: "G.48", series: "G", patterns: ["g.48", "g48"] },

  // M Series
  { display: "M.22", series: "M", patterns: ["m.22", "m22"] },

  // M+ Series
  { display: "M+450P", series: "M+", patterns: ["m+450p", "m+ 450p", "m+450", "450p"] },
  { display: "M+350",  series: "M+", patterns: ["m+350",  "m+ 350",  "350p"] },
];

// All series names for filter dropdown
export const ALL_SERIES = ["A", "W", "B", "C", "D", "E", "G", "M", "M+"];
export const ALL_MODELS = MODEL_DEFINITIONS.map(m => m.display);

// Detect model from a block of text — returns first match found
export function detectMachineModel(text) {
  if (!text) return null;
  const s = " " + text.toLowerCase() + " ";

  // Sort by pattern length descending so longer/more specific patterns match first
  const sorted = MODEL_DEFINITIONS.flatMap(def =>
    def.patterns.map(p => ({ display: def.display, series: def.series, pattern: p }))
  ).sort((a, b) => b.pattern.length - a.pattern.length);

  for (const { display, pattern } of sorted) {
    // Match pattern surrounded by non-alphanumeric boundaries to avoid false positives
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
    if (regex.test(s)) return display;
  }

  // Series-level fallback (e.g. "A series", "D series")
  for (const series of ALL_SERIES) {
    const regex = new RegExp(`(?<![a-z])${series.toLowerCase()}[\\s-]series`, "i");
    if (regex.test(s)) return `${series} series`;
  }

  return null;
}
