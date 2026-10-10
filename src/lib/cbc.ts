/** CBC (Competency Based Curriculum) performance levels. */

export const LEVEL_NAMES = {
  EE: "Exceeding Expectations",
  ME: "Meeting Expectations",
  AE: "Approaching Expectations",
  BE: "Below Expectations",
} as const;
export type BaseLevel = keyof typeof LEVEL_NAMES;
export const BASE_LEVELS = Object.keys(LEVEL_NAMES) as BaseLevel[];

/** Options offered in level pickers: the four levels and the eight sub-levels. */
export const LEVEL_OPTIONS = ["EE", "ME", "AE", "BE", "EE1", "EE2", "ME1", "ME2", "AE1", "AE2", "BE1", "BE2"];

/** Learning areas suggested when a class has no results yet (any name can be used). */
export const SUGGESTED_AREAS = [
  "English",
  "Kiswahili",
  "Mathematics",
  "Integrated Science",
  "Social Studies",
  "Religious Education",
  "Pre-Technical Studies",
  "Agriculture",
  "Creative Arts and Sports",
];

/**
 * Accept "EE", "ee2", "Meeting expectations", "M.E." and similar; return the
 * canonical code, or null if it isn't a CBC level. Blank means "no level".
 */
export function normalizeLevel(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/[.\s]/g, "");
  if (!t) return null;
  const m = /^(EE|ME|AE|BE)([12])?$/.exec(t);
  if (m) return m[1] + (m[2] ?? "");
  const words: Record<string, BaseLevel> = {
    EXCEEDINGEXPECTATIONS: "EE",
    EXCEEDINGEXPECTATION: "EE",
    MEETINGEXPECTATIONS: "ME",
    MEETINGEXPECTATION: "ME",
    APPROACHINGEXPECTATIONS: "AE",
    APPROACHINGEXPECTATION: "AE",
    BELOWEXPECTATIONS: "BE",
    BELOWEXPECTATION: "BE",
  };
  return words[t] ?? null;
}

export function baseLevel(level: string): BaseLevel {
  return level.slice(0, 2) as BaseLevel;
}

/** 4 (EE) down to 1 (BE), for averages and comparisons. */
export function levelScore(level: string): number {
  return { EE: 4, ME: 3, AE: 2, BE: 1 }[baseLevel(level)] ?? 0;
}

export function describeLevel(level: string): string {
  return `${level} (${LEVEL_NAMES[baseLevel(level)] ?? "?"})`;
}
