import {
  COULISSANT_PVC_INDEX,
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

type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ColumnStats = {
  xSum: Record<number, number>;
  xCount: Record<number, number>;
};

function createColumnStats(): ColumnStats {
  return { xSum: {}, xCount: {} };
}

function recordColumn(stats: ColumnStats, idx: number, cell: PdfTextItem) {
  const center = cell.x + cell.width / 2;
  stats.xSum[idx] = (stats.xSum[idx] ?? 0) + center;
  stats.xCount[idx] = (stats.xCount[idx] ?? 0) + 1;
}

function findNumericCellByColumn(row: PdfTextItem[], stats: ColumnStats, idx: number): PdfTextItem | null {
  const numItems = row.filter((it) => isNumeric(it.str));
  if (!numItems.length) return null;
  if (!stats.xCount[idx]) return numItems[idx] ?? null;

  const targetX = stats.xSum[idx] / stats.xCount[idx];
  const colCenters: { idx: number; x: number }[] = Object.keys(stats.xCount).map((k) => {
    const i = Number(k);
    return { idx: i, x: stats.xSum[i] / stats.xCount[i] };
  });

  let best: PdfTextItem | null = null;
  let bestDist = Infinity;
  for (const it of numItems) {
    const center = it.x + it.width / 2;
    const d = Math.abs(center - targetX);
    if (d >= bestDist) continue;
    let nearestIdx = idx;
    let nearestDist = d;
    for (const c of colCenters) {
      const cd = Math.abs(center - c.x);
      if (cd < nearestDist) {
        nearestDist = cd;
        nearestIdx = c.idx;
      }
    }
    if (nearestIdx !== idx) continue;
    bestDist = d;
    best = it;
  }

  return bestDist <= 8 ? best : (numItems[idx] ?? null);
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
  let currentColumns = createColumnStats();
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
      // Moyenne row → close current week. Compute the moyenne for every line
      // from the (formula-applied) day values, exactly like the main
      // calculator does — this way the delays page uses the same numbers
      // shown on the production page.
      if (row[0] && /^moyenne$/i.test(row[0].str.trim())) {
        const moyenne: Partial<Record<LineKey, number>> = {};
        const dayAvg = (key: LineKey): number | undefined => {
          const vals = currentDays
            .map((d) => d.values[key])
            .filter((v): v is number => v != null);
          if (!vals.length) return undefined;
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        };
        for (const key of ["trappe", "mab", "coulissant_pvc", "peinture"] as LineKey[]) {
          const v = dayAvg(key);
          if (v != null) moyenne[key] = v;
        }
        const peintureCell = findNumericCellByColumn(row, currentColumns, TOTAL_INDEX);
        if (peintureCell) moyenne.peinture = parseNum(peintureCell.str);
        if (!computeVf) {
          const pvcCell = findNumericCellByColumn(row, currentColumns, COULISSANT_PVC_INDEX);
          if (pvcCell) moyenne.coulissant_pvc = parseNum(pvcCell.str);
        }
        if (currentDays.length > 0) {
          weeks.push({ days: currentDays, moyenne });
          currentDays = [];
          currentColumns = createColumnStats();
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
      numItems.forEach((it, i) => recordColumn(currentColumns, i, it));

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
 * Week-based search. Each entry in `weeks` is treated as one PDF week
 * (Thursday → Wednesday). Week number = index + 1. Returns the first
 * week (with weekNumber >= minWeek) whose average for `line` is below
 * the threshold, plus the first day inside that week that is below the
 * threshold (for display).
 */
/**
 * Buffer (units) below the threshold at which a week's average is considered
 * "full" — once moyenne >= max - FULL_BUFFER we move on to the next week.
 */
const FULL_BUFFER = 5;

export function findFirstAvailableWeek(
  weeks: WeekData[],
  line: LineKey,
  thresholds: Settings["thresholds"],
  minWeek = 4,
  today?: Date,
  thresholdKey?: keyof Settings["thresholds"],
): { weekNumber: number; date: Date | null } | null {
  const max = thresholds[thresholdKey ?? LINE_THRESHOLD[line]];
  if (!max || max <= 0) return null;
  const ref = today ? new Date(today) : new Date();
  ref.setHours(0, 0, 0, 0);
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    if (!w.days.length) continue;
    // Week number from week's first day (Thursday) relative to today:
    // floor((firstDay - today) / 7 days). A week starting in <7 days = 0
    // (too soon to deliver), the following Thursday = 1, etc.
    const diffDays = Math.floor(
      (w.days[0].date.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24),
    );
    const weekNumber = Math.floor(diffDays / 7);
    if (weekNumber < minWeek) continue;
    const moy = w.moyenne[line];
    if (moy != null && moy >= max - FULL_BUFFER) continue; // within 5 of max → full
    // Pick first day below threshold for the displayed date (fallback: first day).
    let firstDay: Date | null = null;
    for (const d of w.days) {
      const v = d.values[line];
      if (v != null && v < max) {
        firstDay = d.date;
        break;
      }
    }
    if (!firstDay && w.days.length > 0) firstDay = w.days[0].date;
    return { weekNumber, date: firstDay };
  }
  return null;
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
  // Week 1 = first PDF week (typically next Thursday). Minimum 4 weeks.
  for (const line of lines) {
    const found = findFirstAvailableWeek(allWeeks, line, settings.thresholds, 4, today);
    if (!found) {
      results[line] = { date: null, text: null };
      needsMore.push(line);
    } else {
      results[line] = { date: found.date, text: formatDelay(found.weekNumber) };
    }
  }

  return { results, needsMore, weeksProcessed: allWeeks.length };
}