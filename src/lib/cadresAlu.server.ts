import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import MDBReader from "mdb-reader";

export type CadreAluRow = {
  id: string;
  sequence: string;
  tete: string;
  jambage: string;
  astragale: string;
  couleur: string;
};

const COLOR_WORDS = [
  "Blanc",
  "Noir",
  "Brun",
  "Sable",
  "Amande",
  "Gris",
  "Beige",
  "Vert",
  "Rouge",
  "Bleu",
  "Chêne",
  "Acajou",
  "Merisier",
  "Cerisier",
  "Taupe",
  "Charcoal",
  "Bronze",
  "Argent",
  "Ivoire",
  "Commercial",
];

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

function matchesDate(cell: unknown, target: Date): boolean {
  if (cell === null || cell === undefined || cell === "") return false;
  const y = target.getFullYear();
  const m = target.getMonth() + 1;
  const d = target.getDate();

  if (cell instanceof Date) {
    return cell.getFullYear() === y && cell.getMonth() + 1 === m && cell.getDate() === d;
  }
  const s = String(cell);
  if (s.includes(`${y}-${pad2(m)}-${pad2(d)}`)) return true;
  const dmy = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const [, dd, mm, yy] = dmy;
    let year = parseInt(yy, 10);
    if (year < 100) year += 2000;
    if (parseInt(dd, 10) === d && parseInt(mm, 10) === m && year === y) return true;
    if (parseInt(mm, 10) === d && parseInt(dd, 10) === m && year === y) return true;
  }
  return false;
}

/** "9-3/4''" -> "9 3/4" */
function normalizeFraction(raw: string): string {
  return raw
    .replace(/''|"|”/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findAluCell(values: string[]): string | null {
  for (const v of values) {
    if (/\balum?(inium|inum)?\b/i.test(v) || /\balu\b/i.test(v)) return v;
  }
  return null;
}

/** MAB en J, MAB J, or MAB alone next to a lone "J" -> excluded. */
function isExcluded(values: string[]): boolean {
  for (const v of values) {
    if (!/\bMAB\b/i.test(v)) continue;
    if (/\bMAB\b\s*(en\s*)?J\b/i.test(v)) return true;
    if (/\bJ\b/.test(v.replace(/J-\d+/g, ""))) return true;
    return true; // any MAB mention on an alu line is excluded
  }
  return false;
}

function extractId(code: string): string {
  const m = code.match(/^([A-Za-z0-9]+-\d+)/);
  return m ? m[1] : code;
}

function extractTete(description: string): string {
  const m = description.match(/\bT-\s*(\d+(?:[\s./-]\d+\/\d+)?)/i);
  return m ? normalizeFraction(m[1]) : "";
}

function extractJambage(aluCell: string, allValues: string[]): string {
  const fromAlu = aluCell.match(/Cadre\s*(\d+(?:[-\s]\d+\/\d+)?)\s*''/i);
  if (fromAlu) return normalizeFraction(fromAlu[1]);
  for (const v of allValues) {
    const m = v.match(/Cadre\s*(\d+(?:[-\s]\d+\/\d+)?)\s*''/i);
    if (m) return normalizeFraction(m[1]);
  }
  return "";
}

function extractAstragale(values: string[]): string {
  for (const v of values) {
    if (/astragal/i.test(v)) return "Oui";
  }
  for (const v of values) {
    if (/porte[^,;]{0,20}\bdouble\b/i.test(v)) return "Oui";
  }
  return "";
}

function extractCouleur(row: Record<string, unknown>, aluCell: string): string {
  const opt1 = toStr(row.Opt1);
  const pick = (text: string): string => {
    if (!text) return "";
    const word = COLOR_WORDS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text));
    const code = text.match(/\(([A-Za-z]?-?\d{3,4})\)/);
    if (word && code) return `${word} (${code[1]})`;
    if (word) return word;
    if (code) return code[1];
    return "";
  };
  // Door colour first (Opt1), then the aluminium frame line.
  const fromDoor = pick(opt1);
  if (fromDoor) return fromDoor;
  const afterCouleur = aluCell.match(/couleur\s+(.+)$/i);
  return pick(afterCouleur ? afterCouleur[1] : aluCell);
}

function findTable(reader: MDBReader) {
  for (const name of reader.getTableNames()) {
    const table = reader.getTable(name);
    const cols = table.getColumnNames();
    if (cols.includes("Code") && cols.includes("Sequence") && cols.includes("Description")) {
      return table;
    }
  }
  return null;
}

export function extractCadreAluRows(
  fileBuffer: ArrayBuffer,
  targetDate: Date | null,
): CadreAluRow[] {
  const reader = new MDBReader(Buffer.from(fileBuffer));
  const table = findTable(reader);
  if (!table) throw new Error("Aucune table compatible trouvée dans le fichier Access.");

  const rows = table.getData() as Array<Record<string, unknown>>;
  const kept: CadreAluRow[] = [];

  for (const r of rows) {
    const sequence = toStr(r.Sequence);
    if (!/^(LA|LB|SA|PA)/i.test(sequence)) continue;
    if (targetDate && !matchesDate(r.Ligne1, targetDate)) continue;

    const values = Object.values(r).map(toStr).filter(Boolean);
    const aluCell = findAluCell(values);
    if (!aluCell) continue;
    if (isExcluded(values)) continue;

    kept.push({
      id: extractId(toStr(r.Code)),
      sequence,
      tete: extractTete(toStr(r.Description)),
      jambage: extractJambage(aluCell, values),
      astragale: extractAstragale(values),
      couleur: extractCouleur(r, aluCell),
    });
  }

  kept.sort((a, b) => a.sequence.localeCompare(b.sequence, "fr", { numeric: true }));
  return kept;
}

export async function buildCadreAluPdf(
  rows: CadreAluRow[],
  targetDate: Date | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 36;
  const usableWidth = pageWidth - margin * 2;

  const headers = ["ID", "SEQUENCE", "TÊTE", "JAMBAGE", "ASTRAGALE", "COULEUR"];
  const widths = [
    usableWidth * 0.18,
    usableWidth * 0.14,
    usableWidth * 0.1,
    usableWidth * 0.14,
    usableWidth * 0.14,
    usableWidth * 0.3,
  ];
  const rowHeight = 18;
  const headerHeight = 22;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

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
      page.drawText(h, { x: x + 4, y: y - headerHeight + 7, size: 9, font: bold, color: rgb(0, 0, 0) });
      x += widths[i];
    });
    y -= headerHeight;
  };

  const truncate = (text: string, maxWidth: number, size: number) => {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
    return `${t}…`;
  };

  page.drawText("Cadres Aluminium", { x: margin, y: y - 14, size: 14, font: bold, color: rgb(0, 0, 0) });
  page.drawText(
    `${targetDate ? `Date: ${formatDate(targetDate)}   —   ` : ""}${rows.length} ligne(s)`,
    { x: margin, y: y - 30, size: 10, font, color: rgb(0.3, 0.3, 0.3) },
  );
  y -= 40;
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
    [r.id, r.sequence, r.tete, r.jambage, r.astragale, r.couleur].forEach((v, i) => {
      page.drawText(truncate(v, widths[i] - 8, 9), {
        x: x + 4,
        y: y - rowHeight + 5,
        size: 9,
        font,
        color: rgb(0, 0, 0),
      });
      x += widths[i];
    });
    y -= rowHeight;
  });

  return await doc.save();
}
