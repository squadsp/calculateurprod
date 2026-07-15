import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import MDBReader from "mdb-reader";

export type MachinageRow = {
  id: string;
  sequence: string;
  date: string;
  machinage: string;
};

const TARGET_COLUMNS = ["Code", "Sequence", "Ligne1", "Opt3"] as const;

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return formatDate(v);
  return String(v);
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Return true if the cell's value refers to the same calendar day as `target`.
 * Accepts Date instances or strings containing the YYYY-MM-DD substring or the
 * DD/MM/YYYY / MM/DD/YYYY forms.
 */
function matchesDate(cell: unknown, target: Date): boolean {
  if (cell === null || cell === undefined || cell === "") return false;
  const y = target.getFullYear();
  const m = target.getMonth() + 1;
  const d = target.getDate();

  if (cell instanceof Date) {
    return (
      cell.getFullYear() === y &&
      cell.getMonth() + 1 === m &&
      cell.getDate() === d
    );
  }
  const s = String(cell);
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  if (s.includes(iso)) return true;
  // Try parsing as Date
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return (
      parsed.getFullYear() === y &&
      parsed.getMonth() + 1 === m &&
      parsed.getDate() === d
    );
  }
  return false;
}

/**
 * Find, across all tables in the MDB, the first table exposing the columns we need.
 */
function findMatchingTable(reader: MDBReader) {
  const names = reader.getTableNames();
  for (const name of names) {
    const table = reader.getTable(name);
    const cols = table.getColumnNames();
    const hasAll = TARGET_COLUMNS.every((c) => cols.includes(c));
    if (hasAll) return table;
  }
  return null;
}

export function extractMachinageRows(
  fileBuffer: ArrayBuffer,
  targetDate: Date,
): MachinageRow[] {
  const buf = Buffer.from(fileBuffer);
  const reader = new MDBReader(buf);
  const table = findMatchingTable(reader);
  if (!table) {
    throw new Error(
      `Aucune table trouvée avec les colonnes ${TARGET_COLUMNS.join(", ")}.`,
    );
  }

  const rows = table.getData<Record<string, unknown>>({
    columns: [...TARGET_COLUMNS],
  });

  const kept: MachinageRow[] = [];
  for (const r of rows) {
    const opt3 = toStr(r.Opt3);
    if (!/trous\s*3\s*1\/4/i.test(opt3)) continue;
    if (!matchesDate(r.Ligne1, targetDate)) continue;
    kept.push({
      id: toStr(r.Code),
      sequence: toStr(r.Sequence),
      date: toStr(r.Ligne1),
      machinage: opt3,
    });
  }
  return kept;
}

export async function buildMachinagePdf(
  rows: MachinageRow[],
  targetDate: Date,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 40;
  const usableWidth = pageWidth - margin * 2;

  // Column layout
  const headers = ["ID", "SEQUENCE", "DATE", "MACHINAGE"];
  const widths = [
    usableWidth * 0.18,
    usableWidth * 0.14,
    usableWidth * 0.22,
    usableWidth * 0.46,
  ];
  const rowHeight = 18;
  const headerHeight = 22;
  const titleHeight = 40;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawTitle = () => {
    page.drawText("Machinage — Trous 3 1/4", {
      x: margin,
      y: y - 14,
      size: 14,
      font: bold,
      color: rgb(0, 0, 0),
    });
    page.drawText(
      `Date: ${formatDate(targetDate)}   —   ${rows.length} ligne(s)`,
      { x: margin, y: y - 30, size: 10, font, color: rgb(0.3, 0.3, 0.3) },
    );
    y -= titleHeight;
  };

  const drawHeader = () => {
    let x = margin;
    page.drawRectangle({
      x: margin,
      y: y - headerHeight,
      width: usableWidth,
      height: headerHeight,
      color: rgb(0.92, 0.92, 0.95),
    });
    headers.forEach((h, i) => {
      page.drawText(h, {
        x: x + 4,
        y: y - headerHeight + 7,
        size: 10,
        font: bold,
        color: rgb(0, 0, 0),
      });
      x += widths[i];
    });
    y -= headerHeight;
  };

  const truncate = (text: string, maxWidth: number, size: number) => {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + "…";
  };

  drawTitle();
  drawHeader();

  if (rows.length === 0) {
    page.drawText("Aucune ligne correspondante.", {
      x: margin,
      y: y - 20,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  rows.forEach((r, idx) => {
    if (y - rowHeight < margin) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeader();
    }
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: margin,
        y: y - rowHeight,
        width: usableWidth,
        height: rowHeight,
        color: rgb(0.97, 0.97, 0.97),
      });
    }
    let x = margin;
    const values = [r.id, r.sequence, r.date, r.machinage];
    values.forEach((v, i) => {
      const text = truncate(v, widths[i] - 8, 10);
      page.drawText(text, {
        x: x + 4,
        y: y - rowHeight + 5,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      });
      x += widths[i];
    });
    y -= rowHeight;
  });

  return await doc.save();
}