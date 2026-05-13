import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  DAY_REGEX,
  TRAPPE_INDEX,
  MAB_INDEX,
  computeValue,
  formatNumber,
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

type TextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type CellEdit = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  newText: string;
};

function isNumeric(s: string): boolean {
  return /^-?\d{1,4}([.,]\d+)?$/.test(s.trim());
}

function parseNum(s: string): number {
  return parseFloat(s.replace(",", "."));
}

/**
 * Extract text items grouped into rows per page.
 * Returns rows sorted top→bottom, items sorted left→right.
 */
async function extractRows(buf: ArrayBuffer): Promise<{
  pages: { width: number; height: number; rows: TextItem[][] }[];
}> {
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: buf.slice(0) });
  const pdf = await loadingTask.promise;
  const pages: { width: number; height: number; rows: TextItem[][] }[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    const items: TextItem[] = [];
    for (const it of tc.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5]; // PDF coords, origin bottom-left
      items.push({
        str: it.str,
        x,
        y,
        width: it.width,
        height: it.height || Math.abs(it.transform[3]) || 8,
      });
    }

    // Group by y (rows). Tolerance ~3 units.
    items.sort((a, b) => b.y - a.y);
    const rows: TextItem[][] = [];
    const TOL = 3;
    for (const it of items) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last[0].y - it.y) <= TOL) {
        last.push(it);
      } else {
        rows.push([it]);
      }
    }
    for (const r of rows) r.sort((a, b) => a.x - b.x);

    pages.push({ width: viewport.width, height: viewport.height, rows });
  }
  return { pages };
}

/**
 * Identify day rows and compute the cell edits required for Trappe & MAB.
 */
function planEdits(
  pages: { width: number; height: number; rows: TextItem[][] }[],
  settings: Settings,
): { edits: CellEdit[]; daysFound: number } {
  const edits: CellEdit[] = [];
  let daysFound = 0;

  pages.forEach((page, pageIndex) => {
    for (const row of page.rows) {
      // Day rows look like: "jeudi" | "le" | "14" | 134.00 | 4,00 | ...
      // The day name is the first item, then "le", then the day number, then 18 column values.
      if (!row[0] || !/^(jeudi|vendredi|samedi|dimanche|lundi|mardi|mercredi)$/i.test(row[0].str.trim())) {
        continue;
      }
      // Skip the day label items (day name + "le" + day-of-month number).
      // Find the first item that is "le" then skip it and the next number.
      let cursor = 1;
      while (cursor < row.length && !/^le$/i.test(row[cursor].str.trim())) cursor++;
      cursor++; // skip "le"
      // skip the day-of-month number
      while (cursor < row.length && !isNumeric(row[cursor].str)) cursor++;
      cursor++; // skip the day-of-month value itself
      const numItems = row.slice(cursor).filter((it) => isNumeric(it.str));
      if (numItems.length < 8) continue; // not a full day row

      const values = numItems.map((it) => parseNum(it.str));
      daysFound++;

      // Trappe (index 2)
      if (numItems[TRAPPE_INDEX]) {
        const cell = numItems[TRAPPE_INDEX];
        const newVal = computeValue(values, settings.trappe_components);
        edits.push({
          pageIndex,
          x: cell.x,
          y: cell.y,
          width: cell.width,
          height: cell.height,
          newText: formatNumber(newVal),
        });
      }
      // MAB (index 5)
      if (numItems[MAB_INDEX]) {
        const cell = numItems[MAB_INDEX];
        const newVal = computeValue(values, settings.mab_components);
        edits.push({
          pageIndex,
          x: cell.x,
          y: cell.y,
          width: cell.width,
          height: cell.height,
          newText: formatNumber(newVal),
        });
      }
    }
  });

  return { edits, daysFound };
}

/**
 * Apply edits to a fresh copy of the PDF using pdf-lib.
 */
async function applyEdits(
  buf: ArrayBuffer,
  edits: CellEdit[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(buf.slice(0));
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const e of edits) {
    const page = pages[e.pageIndex];
    if (!page) continue;
    const padX = 1;
    const padY = 1;
    // Cover original text with white rectangle.
    page.drawRectangle({
      x: e.x - padX,
      y: e.y - padY,
      width: Math.max(e.width + padX * 2, 24),
      height: e.height + padY * 2,
      color: rgb(1, 1, 1),
    });
    // Draw new value, right-aligned to the original right edge so columns stay aligned.
    const fontSize = Math.max(6, Math.min(e.height, 9));
    const textWidth = font.widthOfTextAtSize(e.newText, fontSize);
    const rightEdge = e.x + e.width;
    const drawX = rightEdge - textWidth;
    page.drawText(e.newText, {
      x: drawX,
      y: e.y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  return await pdfDoc.save();
}

export async function processPdf(
  buf: ArrayBuffer,
  settings: Settings,
): Promise<{ bytes: Uint8Array; daysFound: number; edits: number }> {
  const { pages } = await extractRows(buf);
  const { edits, daysFound } = planEdits(pages, settings);
  const bytes = await applyEdits(buf, edits);
  return { bytes, daysFound, edits: edits.length };
}