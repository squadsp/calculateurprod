import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

export type PortesKeywords = {
  laminate: string[]; // overrides everything (kept even if reject tokens present)
  reject: string[];   // reject if present (unless laminate match)
  keep: string[];     // keep if present (after reject filter)
};

export const DEFAULT_PORTES_KEYWORDS: PortesKeywords = {
  laminate: ["laminé", "lamine"],
  reject: ["#3R", "#4R", "3R", "4R", "std"],
  keep: ["#1", "#2"],
};

type Item = { str: string; x: number; y: number; width: number; height: number };

function isIntegerToken(s: string): boolean {
  return /^\d{1,5}$/.test(s.trim());
}

function containsAny(text: string, needles: string[]): boolean {
  const t = text.toLowerCase();
  return needles.some((n) => n && t.includes(n.toLowerCase()));
}

function classify(desc: string, kw: PortesKeywords): "keep" | "skip" {
  if (containsAny(desc, kw.laminate)) return "keep";
  if (containsAny(desc, kw.reject)) return "skip";
  if (containsAny(desc, kw.keep)) return "keep";
  return "skip";
}

export async function processPortesPdf(
  buf: ArrayBuffer,
  keywords: PortesKeywords = DEFAULT_PORTES_KEYWORDS,
  options: { highlights?: boolean } = {},
): Promise<{ bytes: Uint8Array; kept: number; sum: number; replaced: number }> {
  const highlights = options.highlights ?? true;
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: buf.slice(0) });
  const pdf = await loadingTask.promise;

  type PageInfo = {
    width: number;
    height: number;
    rows: Item[][];
  };
  const pages: PageInfo[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const it of tc.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>) {
      if (!it.str || !it.str.trim()) continue;
      items.push({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        width: it.width,
        height: it.height || Math.abs(it.transform[3]) || 8,
      });
    }
    items.sort((a, b) => b.y - a.y);
    const rows: Item[][] = [];
    const TOL = 3;
    for (const it of items) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last[0].y - it.y) <= TOL) last.push(it);
      else rows.push([it]);
    }
    for (const r of rows) r.sort((a, b) => a.x - b.x);
    pages.push({ width: viewport.width, height: viewport.height, rows });
  }

  // Build data-row catalogue (rows that look like "<description text> ... <qty integer>").
  // A data row must have at least one non-numeric text item before a final integer.
  type DataRow = {
    pageIndex: number;
    row: Item[];
    qtyItem: Item;
    qty: number;
    desc: string;
    keep: boolean;
  };
  const dataRows: DataRow[] = [];
  // Also collect candidate "total" cells: rows whose ONLY content is an integer,
  // or rows that start with "Total". These appear at the end of the document.
  type TotalCell = { pageIndex: number; item: Item; row: Item[]; kind: "total" | "lone" };
  const totalCandidates: TotalCell[] = [];

  pages.forEach((page, pageIndex) => {
    for (const row of page.rows) {
      const last = row[row.length - 1];
      if (!last) continue;

      // Skip obvious header rows ("Description" / "Qty").
      const joined = row.map((r) => r.str).join(" ").trim();
      if (/^description\b/i.test(joined) && /qty/i.test(joined)) continue;

      const firstStr = (row[0].str || "").trim();
      const isTotalLabel = /^total\b/i.test(firstStr);

      // Pure-number-only row (e.g. the standalone "46" in the middle).
      const numericItems = row.filter((it) => isIntegerToken(it.str));
      const nonNumeric = row.filter((it) => !isIntegerToken(it.str));

      if (isTotalLabel && numericItems.length >= 1) {
        totalCandidates.push({ pageIndex, item: numericItems[numericItems.length - 1], row, kind: "total" });
        continue;
      }
      if (nonNumeric.length === 0 && numericItems.length === 1) {
        totalCandidates.push({ pageIndex, item: numericItems[0], row, kind: "lone" });
        continue;
      }

      // Otherwise: candidate data row. Last item must be a small integer,
      // and there must be descriptive text before it.
      if (!isIntegerToken(last.str)) continue;
      const before = row.slice(0, -1);
      const descText = before.map((it) => it.str).join(" ").trim();
      if (!descText) continue;
      // Ignore meaningless trailing-number rows (e.g. footer page number "1").
      if (descText.length < 3) continue;

      const keep = classify(descText, keywords) === "keep";
      dataRows.push({
        pageIndex,
        row,
        qtyItem: last,
        qty: parseInt(last.str, 10),
        desc: descText,
        keep,
      });
    }
  });

  const kept = dataRows.filter((d) => d.keep);
  const sum = kept.reduce((acc, d) => acc + d.qty, 0);

  // Apply edits with pdf-lib.
  const pdfDoc = await PDFDocument.load(buf.slice(0));
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const outPages = pdfDoc.getPages();
  const HL = rgb(0.72, 0.95, 0.72); // soft green

  if (highlights) {
    for (const d of kept) {
      const page = outPages[d.pageIndex];
      if (!page) continue;
      const xs = d.row.map((it) => it.x);
      const xe = d.row.map((it) => it.x + it.width);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xe);
      const padX = 2;
      const padY = 2;
      const h = Math.max(...d.row.map((it) => it.height));
      page.drawRectangle({
        x: minX - padX,
        y: d.qtyItem.y - padY,
        width: maxX - minX + padX * 2,
        height: h + padY * 2,
        color: HL,
        opacity: 0.45,
      });
    }
  }

  // Replace total numbers. Only the totals at the very end of the document
  // (last page) get rewritten; this matches the "case with the total" rule.
  const lastPageIndex = pages.length - 1;
  // Anchor on the "Total :" row on the last page. Then also replace any lone
  // integer cell sitting close above it on the same page (the column sum).
  // This prevents us from rewriting the footer page-number.
  const totalAnchor = totalCandidates.find(
    (t) => t.pageIndex === lastPageIndex && t.kind === "total",
  );
  const toReplace: TotalCell[] = [];
  if (totalAnchor) {
    toReplace.push(totalAnchor);
    for (const t of totalCandidates) {
      if (t === totalAnchor) continue;
      if (t.pageIndex !== lastPageIndex) continue;
      if (t.kind !== "lone") continue;
      // Above the Total row (higher y in PDF coords), within 120pt.
      if (t.item.y > totalAnchor.item.y && t.item.y - totalAnchor.item.y < 120) {
        toReplace.push(t);
      }
    }
  }
  let replaced = 0;
  for (const t of toReplace) {
    const page = outPages[t.pageIndex];
    if (!page) continue;
    const it = t.item;
    const fontSize = Math.max(7, Math.min(it.height, 11));
    // Detect bold-ish from original width / char count heuristic — fall back to bold if first row item starts with "Total".
    const useBold = /^total\b/i.test((t.row[0]?.str ?? "").trim());
    const f = useBold ? fontBold : font;
    const newText = String(sum);
    const newWidth = f.widthOfTextAtSize(newText, fontSize);
    const rectWidth = Math.max(it.width, newWidth) + 4;
    const rightEdge = it.x + it.width;
    page.drawRectangle({
      x: rightEdge - rectWidth + 2,
      y: it.y - 2,
      width: rectWidth,
      height: it.height + 4,
      color: rgb(1, 1, 1),
    });
    page.drawText(newText, {
      x: rightEdge - newWidth,
      y: it.y,
      size: fontSize,
      font: f,
      color: rgb(0, 0, 0),
    });
    replaced++;
  }

  const bytes = await pdfDoc.save();
  return { bytes, kept: kept.length, sum, replaced };
}