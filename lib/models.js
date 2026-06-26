// i2R CNC Machine Model Definitions and Detection

export const MODEL_DEFINITIONS = [
  // A Series
  { display: "A.22", series: "A", patterns: ["a.22","a22","a 22"] },
  { display: "A.23", series: "A", patterns: ["a.23","a23","a 23"] },
  { display: "A.24", series: "A", patterns: ["a.24","a24","a 24","a24-3hp","a.24-3hp"] },
  { display: "A.42", series: "A", patterns: ["a.42","a42","a 42"] },
  { display: "A.44", series: "A", patterns: ["a.44","a44","a 44"] },

  // W Series
  { display: "W.42", series: "W", patterns: ["w.42","w42","w 42"] },

  // B Series — i2R 4/6/8 aliases
  { display: "B.22", series: "B", alias: "i2R 4", patterns: ["b.22","b22","b 22","i2r 4","i2r-4","i2r4","i2r4s","model 4","i2r4 ","i2ra4"] },
  { display: "B.23", series: "B", alias: "i2R 6", patterns: ["b.23","b23","b 23","i2r 6","i2r-6","i2r6","i2r6s","model 6","i2ra6"] },
  { display: "B.24", series: "B", alias: "i2R 8", patterns: ["b.24","b24","b 24","i2r 8","i2r-8","i2r8","i2r8s","i2r 8s","model 8","i2ra8","i2r8 ","b6"] },

  // C Series
  { display: "C.22", series: "C", patterns: ["c.22","c22","c 22"] },
  { display: "C.24", series: "C", patterns: ["c.24","c24","c 24"] },
  { display: "C.44", series: "C", patterns: ["c.44","c44","c 44"] },
  { display: "C.48", series: "C", patterns: ["c.48","c48","c 48"] },

  // D Series
  { display: "D.11", series: "D", patterns: ["d.11","d11","d 11"] },
  { display: "D.21", series: "D", patterns: ["d.21","d21","d 21"] },
  { display: "D.22", series: "D", patterns: ["d.22","d22","d 22"] },
  { display: "D.24", series: "D", patterns: ["d.24","d24","d 24"] },
  { display: "D.44", series: "D", patterns: ["d.44","d44","d 44"] },

  // E Series
  { display: "E.24", series: "E", patterns: ["e.24","e24","e 24"] },
  { display: "E.44", series: "E", patterns: ["e.44","e44","e 44"] },
  { display: "E.55", series: "E", patterns: ["e.55","e55","e 55"] },

  // G Series
  { display: "G.48", series: "G", patterns: ["g.48","g48","g 48"] },

  // M Series
  { display: "M.22", series: "M", patterns: ["m.22","m22","m 22"] },

  // M+ Series
  { display: "M+450P", series: "M+", patterns: ["m+450p","m+ 450p","m+450","m 450p","450p","m+450p"] },
  { display: "M+350",  series: "M+", patterns: ["m+350","m+ 350","m350","m 350"] },
];

export const ALL_SERIES = ["A","W","B","C","D","E","G","M+","M"];
export const ALL_MODELS = MODEL_DEFINITIONS.map(m => m.display);

// Comprehensive alias map for normalizeModel
// Maps any known variant → canonical display string
const ALIAS_MAP = (() => {
  const map = {};
  for (const def of MODEL_DEFINITIONS) {
    for (const p of def.patterns) {
      map[p.toLowerCase().trim()] = def.display;
    }
    // Also map the display string itself
    map[def.display.toLowerCase()] = def.display;
    if (def.alias) {
      map[def.alias.toLowerCase()] = def.display;
      map[def.alias.toLowerCase().replace(/\s/g,"")] = def.display;
    }
  }
  // Extra catch-all variants found in the wild
  const extras = {
    "i2r8":"B.24","i2r-8":"B.24","i2r 8":"B.24","i2r8s":"B.24","model 8":"B.24","b6":"B.24","i2ra8":"B.24",
    "i2r6":"B.23","i2r-6":"B.23","i2r 6":"B.23","i2r6s":"B.23","model 6":"B.23","i2ra6":"B.23",
    "i2r4":"B.22","i2r-4":"B.22","i2r 4":"B.22","i2r4s":"B.22","model 4":"B.22","i2ra4":"B.22",
    "a22":"A.22","a23":"A.23","a24":"A.24","a42":"A.42","a44":"A.44",
    "a24-3hp":"A.24","a.24-3hp":"A.24",
    "w42":"W.42","w.42":"W.42",
    "b22":"B.22","b23":"B.23","b24":"B.24",
    "c22":"C.22","c24":"C.24","c44":"C.44","c48":"C.48",
    "d11":"D.11","d21":"D.21","d22":"D.22","d24":"D.24","d44":"D.44",
    "e24":"E.24","e44":"E.44","e55":"E.55",
    "g48":"G.48",
    "m22":"M.22",
    "m+350":"M+350","m350":"M+350",
    "m+450p":"M+450P","m450p":"M+450P","450p":"M+450P",
    // iCNC suffix variants (i = iCNC controller, not part of model name)
    "a.22i":"A.22","a.23i":"A.23","a.24i":"A.24","a.42i":"A.42","a.44i":"A.44",
    "a22i":"A.22","a23i":"A.23","a24i":"A.24","a42i":"A.42","a44i":"A.44",
    "w.42i":"W.42","w42i":"W.42",
    "b.22i":"B.22","b.23i":"B.23","b.24i":"B.24",
    "b22i":"B.22","b23i":"B.23","b24i":"B.24",
    "c.22i":"C.22","c.24i":"C.24","c.44i":"C.44","c.48i":"C.48",
    "c22i":"C.22","c24i":"C.24","c44i":"C.44","c48i":"C.48",
    "i2r8i":"B.24","i2r6i":"B.23","i2r4i":"B.22",
    // Series-level fallbacks
    "a series":"A series","b series":"B series","c series":"C series",
    "d series":"D series","e series":"E series","g series":"G series",
    "m series":"M series","m+ series":"M+ series","w series":"W series",
    "i2r":"B.24", // bare "i2r" most likely refers to i2R 8
  };
  Object.assign(map, extras);
  return map;
})();

// Normalize any model string to canonical display format
export function normalizeModel(raw) {
  if (!raw) return null;
  // First strip known suffixes
  const stripped = stripModelSuffix(raw);
  const key = stripped.toLowerCase().trim().replace(/\s+/g, " ");
  if (ALIAS_MAP[key]) return ALIAS_MAP[key];
  // Try without spaces
  const noSpace = key.replace(/\s/g, "");
  if (ALIAS_MAP[noSpace]) return ALIAS_MAP[noSpace];
  // Try original without stripping (in case strip was wrong)
  const origKey = raw.toLowerCase().trim().replace(/\s+/g, " ");
  if (ALIAS_MAP[origKey]) return ALIAS_MAP[origKey];
  // If it already looks like proper format (X.YY), return as-is
  if (/^[A-Z]\.\d{2}$/.test(stripped)) return stripped;
  if (/^[A-Z]\.\d{2}/.test(raw)) return raw;
  return raw; // unknown — return original
}

// Strip known suffixes that don't affect model identity
// e.g. A.24i -> A.24 (i = iCNC controller), A.24s -> A.24, B.24 Pro -> B.24
function stripModelSuffix(text) {
  return text
    .replace(/([A-Z]\.\d{2})i(?![a-zA-Z0-9])/gi, "$1")  // A.24i -> A.24
    .replace(/([A-Z]\.\d{2})([-\s]?(?:pro|plus|s|se|x|cnc|icnc))(?![a-zA-Z0-9])/gi, "$1")
    .replace(/([a-z2]\d{2})i(?![a-zA-Z0-9])/gi, "$1")    // a24i -> a24
    .replace(/i2r(\d)i(?![a-zA-Z0-9])/gi, "i2r$1");       // i2r8i -> i2r8
}

// Detect model from free text
export function detectMachineModel(text) {
  if (!text) return null;
  // Strip suffixes before matching
  const cleaned = stripModelSuffix(text);
  const lower = cleaned.toLowerCase();

  // Sort patterns by length descending (match longest first)
  const allPatterns = MODEL_DEFINITIONS.flatMap(def =>
    def.patterns.map(p => ({ pattern: p, display: def.display }))
  ).sort((a, b) => b.pattern.length - a.pattern.length);

  for (const { pattern, display } of allPatterns) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![a-z0-9.])${escaped}(?![a-z0-9.])`, "i");
    if (regex.test(lower)) return display;
  }

  // Series-level fallback
  for (const series of ALL_SERIES) {
    const escaped = series.replace("+", "\\+");
    const regex = new RegExp(`(?<![a-z])${escaped}[\\s\\-]?series`, "i");
    if (regex.test(lower)) return `${series} series`;
  }

  return null;
}

// Format model label for display: "B.24 (i2R 8)"
const DISPLAY_ALIASES = {};
MODEL_DEFINITIONS.forEach(m => { if (m.alias) DISPLAY_ALIASES[m.display] = m.alias; });

export function formatModelLabel(display) {
  if (!display) return null;
  const alias = DISPLAY_ALIASES[display];
  return alias ? `${display} (${alias})` : display;
}

export const MODEL_ALIASES = DISPLAY_ALIASES;
