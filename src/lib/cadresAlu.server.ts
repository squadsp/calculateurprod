import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import MDBReader from "mdb-reader";

export type CadreAluRow = {
  sequence: string;
  id: string;
  sens: string;
  tete: string;
  jambageLargeur: string;
  jambageEpaisseur: string;
  jambageHauteur: string;
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

/** Frame outer dimensions: "37 1/2 '' "X82 1/2 '' "" -> ["37 1/2", "82 1/2"] */
function parseDimension(dimension: string): { largeur: string; hauteur: string } {
  const cleaned = dimension.replace(/---.*$/, "").replace(/["”]/g, "'");
  const parts = cleaned.split(/x/i);
  const grab = (s: string | undefined) => {
    if (!s) return "";
    const m = s.match(/(\d+(?:\s+\d+\/\d+)?)/);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  };
  return { largeur: grab(parts[0]), hauteur: grab(parts[1]) };
}

/** Exact head measurement, e.g. "35 1/2" (frame width). */
function extractTete(dimension: string): string {
  return parseDimension(dimension).largeur;
}

function extractJambageLargeur(aluCell: string, allValues: string[]): string {
  const fromAlu = aluCell.match(/Cadre\s*(\d+(?:[-\s]\d+\/\d+)?)\s*''/i);
  if (fromAlu) return normalizeFraction(fromAlu[1]);
  for (const v of allValues) {
    const m = v.match(/Cadre\s*(\d+(?:[-\s]\d+\/\d+)?)\s*''/i);
    if (m) return normalizeFraction(m[1]);
  }
  return "";
}

/** "Épaisseur de 1-1/2''" -> "1 1/2" */
function extractEpaisseurs(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const m = v.match(/[ÉEée]paisseur[^0-9]*(\d+(?:[-\s]\d+\/\d+)?)\s*''?/i);
    if (m) out.push(normalizeFraction(m[1]));
  }
  return out;
}

/** Opening direction of the door: Fixe / Gauche / Droite. */
function extractSens(values: string[]): string {
  for (const v of values) {
    if (/\bfixe\b/i.test(v)) return "Fixe";
  }
  for (const v of values) {
    const m = v.match(/\b(gauche|droite)\b/i);
    if (m) return m[1].toLowerCase() === "gauche" ? "Gauche" : "Droite";
  }
  return "";
}

/**
 * Astragale: look at every column of the row. Size (grosse/petite) can be
 * mentioned anywhere on the line, and the side is Fixe > Gauche/Droite.
 */
function extractAstragale(allRowValues: string[], sensRow: string): string {
  const lines = allRowValues.filter((v) => /astragal/i.test(v));
  if (lines.length === 0) return "";

  const scope = lines.join(" ");
  const whole = allRowValues.join(" ");

  let size = "";
  if (/astragale?\s*[-\s]*g\b|\bgrosse?\b|\blarge\b/i.test(scope)) size = "Astragale-G";
  else if (/astragale?\s*[-\s]*p\b|\bpetite?\b|\bmince\b/i.test(scope)) size = "Astragale-P";
  else if (/\bgrosse?\b/i.test(whole)) size = "Astragale-G";
  else if (/\bpetite?\b/i.test(whole)) size = "Astragale-P";
  else {
    const dim = scope.match(/(\d+(?:[-\s]\d+\/\d+)?)\s*''/);
    size = dim ? `Astragale ${normalizeFraction(dim[1])}` : "Astragale";
  }

  let sens = "";
  if (/\bfixe\b/i.test(scope)) sens = "Fixe";
  else {
    const m = scope.match(/\b(gauche|droite)\b/i);
    if (m) sens = m[1].toLowerCase() === "gauche" ? "Gauche" : "Droite";
    else if (sensRow) sens = sensRow;
  }

  return sens ? `${size} ${sens}` : size;
}

/** Astragale / Moulure / Jardin / head thickness note, combined in one column. */
function buildAstragaleDimMab(
  values: string[],
  allRowValues: string[],
  epaisseurJambage: string,
  sensRow: string,
): string {
  const parts: string[] = [];
  const astragale = extractAstragale(allRowValues, sensRow);
  if (astragale) parts.push(astragale);
  if (values.some((v) => /moulure/i.test(v))) parts.push("Moulure");
  if (values.some((v) => /jardin/i.test(v))) parts.push("Jardin");

  if (epaisseurJambage === "1 1/2") {
    const teteEp = values.find((v) => /t[êe]te/i.test(v) && /1[-\s]1\/4/.test(v));
    if (teteEp) parts.push("Tête 1 1/4");
  }
  return parts.join(" • ");
}


function extractCouleur(row: Record<string, unknown>, values: string[], aluCell: string): string {
  const pickWord = (text: string) =>
    COLOR_WORDS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text)) ?? "";

  // Only P- codes are real colour codes (N600 & co. are door models).
  let code = "";
  for (const v of [aluCell, ...values]) {
    const m = v.match(/\(\s*(P-\s*\d{2,4})\s*\)/i);
    if (m) {
      code = m[1].replace(/\s+/g, "").toUpperCase();
      break;
    }
  }

  const afterCouleur = aluCell.match(/couleur\s+(.+)$/i);
  const word =
    pickWord(afterCouleur ? afterCouleur[1] : "") ||
    pickWord(aluCell) ||
    pickWord(toStr(row.Opt1));

  if (word && code) return `${word} (${code})`;
  return word || code;
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

    // Only option/description fields count — never Client or other free-text columns.
    const values = Object.entries(r)
      .filter(([key]) => /^(opt\d+|description|code)$/i.test(key))
      .map(([, v]) => toStr(v))
      .filter(Boolean);
    const aluCell = findAluCell(values);
    if (!aluCell) continue;
    if (isExcluded(values)) continue;

    const allRowValues = Object.values(r).map(toStr).filter(Boolean);
    const dims = parseDimension(toStr(r.Dimension));
    const epaisseurs = extractEpaisseurs(values);
    const epaisseurJambage = epaisseurs[0] ?? "";
    const sens = extractSens(values);

    kept.push({
      sequence,
      id: extractId(toStr(r.Code)),
      sens,
      tete: extractTete(toStr(r.Dimension)),
      jambageLargeur: extractJambageLargeur(aluCell, values),
      jambageEpaisseur: epaisseurJambage,
      jambageHauteur: dims.hauteur,
      astragale: buildAstragaleDimMab(values, allRowValues, epaisseurJambage, sens),
      couleur: extractCouleur(r, values, aluCell),
    });
  }

  kept.sort((a, b) => a.sequence.localeCompare(b.sequence, "fr", { numeric: true }));
  return kept;
}

export const CADRE_ALU_HEADERS = [
  "SA-PA",
  "ID",
  "SENS",
  "MESURE TÊTE",
  "LARGEUR JAMBAGE",
  "ÉPAISSEUR JAMBAGE",
  "HAUTEUR JAMBAGE",
  "ASTRAGALE DIM M.A.B INT",
  "COULEUR",
];


export async function buildCadreAluPdf(
  rows: CadreAluRow[],
  targetDate: Date | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Landscape for the wider table.
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 28;
  const usableWidth = pageWidth - margin * 2;

  const headers = CADRE_ALU_HEADERS;
  const ratios = [0.1, 0.13, 0.11, 0.12, 0.12, 0.12, 0.17, 0.13];
  const widths = ratios.map((r) => usableWidth * r);
  const rowHeight = 18;
  const headerHeight = 24;

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
      page.drawText(h, { x: x + 4, y: y - headerHeight + 8, size: 7.5, font: bold, color: rgb(0, 0, 0) });
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
    [
      r.sequence,
      r.id,
      r.tete,
      r.jambageLargeur,
      r.jambageEpaisseur,
      r.jambageHauteur,
      r.astragale,
      r.couleur,
    ].forEach((v, i) => {
      page.drawText(truncate(v, widths[i] - 8, 8.5), {
        x: x + 4,
        y: y - rowHeight + 5,
        size: 8.5,
        font,
        color: rgb(0, 0, 0),
      });
      x += widths[i];
    });
    y -= rowHeight;
  });

  return await doc.save();
}
