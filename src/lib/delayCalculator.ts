import {
  COULISSANT_PVC_INDEX,
  TRAPPE_INDEX,
  MAB_INDEX,
  VF_INDEX,
  TOTAL_INDEX,
  computeValue,
  type Settings,
} from "./columns";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function isNumeric(s: string): boolean {
  return /^-?\d{1,4}([.,]\d+)?$/.test(s.trim());
}
function parseNum(s: string): number {
  return parseFloat(s.replace(",", "."));
}

export type LineKey = "trappe" | "mab" | "coulissant_pvc" | "peinture";

export type DayData = {
  date: Date;
  values: Partial<Record<LineKey, number>>;
};

export type WeekData = {
  days: DayData[];
  moyenne: Partial<Record<LineKey, number>>;
};

/**
 * Extract weeks from a single PDF, with each day's per-line value.
 * Dates are inferred by walking forward from `startDate`, matching
 * (dayName, dayOfMonth).
 */
export async function extractWeeks(
  buf: ArrayBuffer,
  settings: Settings,
  startDate: Date,
): Promise<{ weeks: WeekData[]; lastDate: Date | null }> {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;

  const computeVf = (settings.vf_components?.length ?? 0) > 0;

  const weeks: WeekData[] = [];
  let currentDays: DayData[] = [];
  // Cursor starts the day before startDate so first match can be startDate itself.
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 1);
  let lastDate: Date | null = null;

  const advanceToMatchingDate = (dayName: string, dayOfMonth: number): Date | null => {
    const targetDayIdx = DAY_NAMES.indexOf(dayName.toLowerCase());
    if (targetDayIdx < 0) return null;
    for (let i = 0; i < 400; i++) {
      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDay() === targetDayIdx && cursor.getDate() === dayOfMonth) {
        return new Date(cursor);
      }
    }
    return null;
  };

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = (tc.items as Array<{ str: string; transform: number[]; width: number; height: number }>)
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        width: it.width,
        height: it.height || 8,
      }));
    items.sort((a, b) => b.y - a.y);
    const rows: typeof items[] = [];
    const TOL = 3;
    for (const it of items) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last[0].y - it.y) <= TOL) last.push(it);
      else rows.push([it]);
    }
    for (const r of rows) r.sort((a, b) => a.x - b.x);

    for (const row of rows) {
      // Moyenne row → close current week
      if (row[0] && /^moyenne$/i.test(row[0].str.trim())) {
        const numItems = row.filter((it) => isNumeric(it.str));
        const nums = numItems.map((it) => parseNum(it.str));
        const moyenne: Partial<Record<LineKey, number>> = {};
        // Best-effort: column positions vary, but the moyenne row typically
        // omits the day-name cells, so numeric items align with the day-row
        // numeric columns. Use the same indices.
        if (nums[TRAPPE_INDEX] != null) moyenne.trappe = nums[TRAPPE_INDEX];
        if (nums[MAB_INDEX] != null) moyenne.mab = nums[MAB_INDEX];
        if (nums[COULISSANT_PVC_INDEX] != null) moyenne.coulissant_pvc = nums[COULISSANT_PVC_INDEX];
        if (nums[TOTAL_INDEX] != null) moyenne.peinture = nums[TOTAL_INDEX];

        // Recompute trappe/mab moyenne from formula-applied day values when available.
        const dayAvg = (key: LineKey): number | undefined => {
          const vals = currentDays
            .map((d) => d.values[key])
            .filter((v): v is number => v != null);
          if (!vals.length) return undefined;
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        };
        const tAvg = dayAvg("trappe");
        const mAvg = dayAvg("mab");
        if (tAvg != null) moyenne.trappe = tAvg;
        if (mAvg != null) moyenne.mab = mAvg;
        if (computeVf) {
          // VF replaces coulissant_pvc highlight column when configured;
          // recompute coulissant_pvc moyenne from VF day average.
          const vfAvg = dayAvg("coulissant_pvc");
          if (vfAvg != null) moyenne.coulissant_pvc = vfAvg;
        }

        if (currentDays.length > 0) {
          weeks.push({ days: currentDays, moyenne });
          currentDays = [];
        }
        continue;
      }

      if (!row[0] || !/^(jeudi|vendredi|samedi|dimanche|lundi|mardi|mercredi)$/i.test(row[0].str.trim())) continue;
      const dayName = row[0].str.trim().toLowerCase();

      let cursor2 = 1;
      while (cursor2 < row.length && !/^le$/i.test(row[cursor2].str.trim())) cursor2++;
      cursor2++; // skip "le"
      while (cursor2 < row.length && !isNumeric(row[cursor2].str)) cursor2++;
      const dayOfMonthItem = row[cursor2];
      if (!dayOfMonthItem) continue;
      const dayOfMonth = parseInt(dayOfMonthItem.str, 10);
      cursor2++;

      const numItems = row.slice(cursor2).filter((it) => isNumeric(it.str));
      if (numItems.length < 8) continue;
      const values = numItems.map((it) => parseNum(it.str));

      const date = advanceToMatchingDate(dayName, dayOfMonth);
      if (!date) continue;
      lastDate = date;

      const dayValues: Partial<Record<LineKey, number>> = {};
      // Trappe & MAB use formula
      dayValues.trappe = computeValue(values, settings.trappe_components);
      dayValues.mab = computeValue(values, settings.mab_components);
      // VF replaces coulissant_pvc highlight column when configured
      if (computeVf) {
        dayValues.coulissant_pvc = computeValue(values, settings.vf_components);
      } else if (values[COULISSANT_PVC_INDEX] != null) {
        dayValues.coulissant_pvc = values[COULISSANT_PVC_INDEX];
      }
      if (values[TOTAL_INDEX] != null) dayValues.peinture = values[TOTAL_INDEX];

      currentDays.push({ date, values: dayValues });
    }
  }

  // If a trailing week with no moyenne row, still push it.
  if (currentDays.length > 0) {
    weeks.push({ days: currentDays, moyenne: {} });
  }

  return { weeks, lastDate };
}

const LINE_THRESHOLD: Record<LineKey, keyof Settings["thresholds"]> = {
  trappe: "trappe",
  mab: "mab",
  coulissant_pvc: "coulissant_pvc",
  peinture: "peinture",
};

/**
 * For a line, scan weeks in chronological order and return the first date where:
 *  - the week's moyenne is below the line's threshold (week not "full"), AND
 *  - that day's value is below the threshold.
 * Returns null if all days across all provided weeks are full.
 */
export function findFirstAvailableDate(
  weeks: WeekData[],
  line: LineKey,
  thresholds: Settings["thresholds"],
): Date | null {
  const max = thresholds[LINE_THRESHOLD[line]];
  if (!max || max <= 0) return null;
  for (const w of weeks) {
    const moy = w.moyenne[line];
    if (moy != null && moy >= max) continue; // whole week full
    for (const d of w.days) {
      const v = d.values[line];
      if (v == null) continue;
      if (v < max) return d.date;
    }
  }
  return null;
}

export function weeksBetween(today: Date, target: Date): number {
  const ms = target.getTime() - today.getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.ceil(days / 7));
}

export function formatDelay(weeks: number): string {
  const lower = Math.max(4, weeks);
  const upper = lower + 2;
  return `${lower}-${upper} semaines`;
}

/**
 * Process multiple PDFs in chronological order. For each line, find the first
 * non-full day across all PDFs and produce a delay range.
 */
export async function calculateDelays(
  pdfs: ArrayBuffer[],
  settings: Settings,
  today: Date = new Date(),
): Promise<{
  results: Record<LineKey, { date: Date | null; text: string | null }>;
  needsMore: LineKey[];
  weeksProcessed: number;
}> {
  const allWeeks: WeekData[] = [];
  let cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);
  for (const buf of pdfs) {
    const { weeks, lastDate } = await extractWeeks(buf, settings, cursor);
    allWeeks.push(...weeks);
    if (lastDate) {
      cursor = new Date(lastDate);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const lines: LineKey[] = ["trappe", "mab", "coulissant_pvc", "peinture"];
  const results = {} as Record<LineKey, { date: Date | null; text: string | null }>;
  const needsMore: LineKey[] = [];
  for (const line of lines) {
    const date = findFirstAvailableDate(allWeeks, line, settings.thresholds);
    if (!date) {
      results[line] = { date: null, text: null };
      needsMore.push(line);
    } else {
      const w = weeksBetween(today, date);
      results[line] = { date, text: formatDelay(w) };
    }
  }

  return { results, needsMore, weeksProcessed: allWeeks.length };
}