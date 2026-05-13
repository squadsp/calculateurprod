export type FieldKey =
  | "battant_pvc"
  | "battant_lamine"
  | "battant_hyb"
  | "battant_alpvcal"
  | "coulissant_hyb"
  | "coulissant_pvc";

export const FIELD_LABELS: Record<FieldKey, string> = {
  battant_pvc: "Battant PVC",
  battant_lamine: "Battant Laminé",
  battant_hyb: "Battant HYB",
  battant_alpvcal: "Battant al/pvc/al",
  coulissant_hyb: "Coulissant HYB",
  coulissant_pvc: "Coulissant PVC",
};

export const ALL_FIELDS: FieldKey[] = [
  "battant_pvc",
  "battant_lamine",
  "battant_hyb",
  "battant_alpvcal",
  "coulissant_hyb",
  "coulissant_pvc",
];

// Column index in each week's day row (0-based, after the day name cell).
// Order of columns in the PDF table:
// 0 Battant PVC, 1 Laminé, 2 Trappe, 3 HYB, 4 al/pvc/al, 5 MAB,
// 6 Couliss HYB, 7 Couliss PVC, 8 VF, 9 SPE, 10 Ass/Bay, 11 LUM,
// 12-16 Peinture, 17 TOTAL
export const COLUMN_INDEX: Record<FieldKey, number> = {
  battant_pvc: 0,
  battant_lamine: 1,
  battant_hyb: 3,
  battant_alpvcal: 4,
  coulissant_hyb: 6,
  coulissant_pvc: 7,
};

export const TRAPPE_INDEX = 2;
export const MAB_INDEX = 5;
export const VF_INDEX = 8;
export const COULISSANT_PVC_INDEX = 7;
// Total column is the last numeric column in a day row (index 17 — Peinture total).
export const TOTAL_INDEX = 17;

export type Component = { field: FieldKey; multiplier: number };
export type Thresholds = {
  trappe: number;
  mab: number;
  coulissant_pvc: number;
  vf: number;
  peinture: number;
};
export type Settings = {
  trappe_components: Component[];
  mab_components: Component[];
  vf_components: Component[];
  thresholds: Thresholds;
  threshold_labels: ThresholdLabels;
};

export type ThresholdLabels = {
  trappe: string;
  mab: string;
  coulissant_pvc: string;
  vf: string;
  peinture: string;
};

export const DEFAULT_THRESHOLD_LABELS: ThresholdLabels = {
  trappe: "Ligne Battant (Trappe)",
  mab: "Ligne Hybride (MAB)",
  coulissant_pvc: "Coulissant PVC",
  vf: "VF",
  peinture: "Ligne Peinture (Total)",
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  trappe: 150,
  mab: 100,
  coulissant_pvc: 100,
  vf: 0,
  peinture: 50,
};

export const DEFAULT_SETTINGS: Settings = {
  trappe_components: [
    { field: "battant_lamine", multiplier: 1.2 },
    { field: "battant_pvc", multiplier: 1 },
  ],
  mab_components: [
    { field: "battant_alpvcal", multiplier: 1.5 },
    { field: "battant_hyb", multiplier: 1 },
    { field: "coulissant_hyb", multiplier: 1 },
  ],
  vf_components: [],
  thresholds: DEFAULT_THRESHOLDS,
  threshold_labels: DEFAULT_THRESHOLD_LABELS,
};

export const DAY_REGEX = /^(jeudi|vendredi|samedi|dimanche|lundi|mardi|mercredi)\s+le\s+\d+/i;

export function computeValue(values: number[], components: Component[]): number {
  let total = 0;
  for (const c of components) {
    const idx = COLUMN_INDEX[c.field];
    const v = values[idx] ?? 0;
    total += v * c.multiplier;
  }
  return total;
}

export function formatNumber(n: number): string {
  // Match the PDF style: two decimals with comma or dot. Use dot to match Trappe/MAB columns style.
  return n.toFixed(2);
}

export type Highlight = "red" | "yellow" | null;

/**
 * Highlight rule:
 *  - value >= max + 10 → red    (well over the limit)
 *  - value >= max - 5  → yellow (full: within 5 under up to 9 over)
 *  - else              → none
 * If max is 0 or negative, no highlighting.
 */
export function getHighlight(value: number, max: number): Highlight {
  if (!max || max <= 0) return null;
  if (value >= max + 10) return "red";
  if (value >= max - 5) return "yellow";
  return null;
}