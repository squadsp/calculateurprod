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
  moustiquaire: string;
  seuil: string;
  souffle: string;
  dummy: string;
  enfigure: string;
  
  couleur: string;
};

/** « Dummy » avec sa mesure si elle est mentionnée sur la ligne. */
function extractDummy(allRowValues: string[]): string {
  const whole = allRowValues.join(" | ");
  if (!/\bdummy\b/i.test(whole)) return "";
  const patterns: RegExp[] = [
    /\bdummy\b[^|]{0,30}?(\d+(?:\s*[-\s]\s*\d+\/\d+)?)\s*(?:''|"|”|po\b|pouces?\b)/i,
    /(\d+(?:\s*[-\s]\s*\d+\/\d+)?)\s*(?:''|"|”)[^|]{0,20}?\bdummy\b/i,
    /\bdummy\b[^|]{0,20}?(\d+(?:\s*[-\s]\s*\d+\/\d+)?)\b/i,
  ];
  for (const p of patterns) {
    const m = whole.match(p);
    if (m && m[1]) return `Dummy ${normalizeFraction(m[1])}`;
  }
  return "Dummy";
}

/**
 * Enfiguré : détecté uniquement quand la ligne mentionne « cadre enfiguré »
 * (ex. « tout cadre enfiguré »). La mention « seuil en pin enfiguré » est
 * ignorée pour cette détection.
 * Sinon « Enfiguré », ou « Enfiguré porte d'acier » dès qu'une 2e slab est
 * mentionnée (« 2e slab », « 2 slab », « double slab », « slab x2 »).
 */
function extractEnfigure(allRowValues: string[]): string {
  const whole = allRowValues
    .join(" ")
    .replace(/seuil\s+en\s+pin\s+enfigur[eé]/gi, "");
  if (!/cadre\s+enfigur[eé]/i.test(whole)) return "";
  const deuxiemeSlab = [
    /\b(?:2|deux)\s*(?:e|i[eè]me|ème|nd)?\s*[-.]?\s*slabs?\b/i,
    /\bdouble\s+slabs?\b/i,
    /\bslabs?\s*(?:x|\*)\s*2\b/i,
    /\bslabs?\s+double\b/i,
  ].some((p) => p.test(whole));
  return deuxiemeSlab ? "Enfiguré porte d'acier" : "Enfiguré";
}





/**
 * Détecte une mention de moustiquaires multiples :
 * "attention 2ième moustiquaire", "moustiquaire double", "avec 2 moustiquaire",
 * "deux moustiquaires", "moustiquaire x2", etc. Retourne uniquement le nombre.
 */
function extractMoustiquaire(allRowValues: string[]): string {
  const whole = allRowValues.join(" ");
  if (!/moustiquaire/i.test(whole)) return "";

  const patterns: RegExp[] = [
    /(\d+)\s*(?:i[eè]me|e|ème)?\s*moustiquaire/i, // "2ième moustiquaire", "2 moustiquaire"
    /moustiquaire\s*(?:x\s*|\*\s*)(\d+)/i, // "moustiquaire x2"
    /deux\s+moustiquaire/i,
    /moustiquaire\s+double/i,
    /double\s+moustiquaire/i,
    /moustiquaires?\s+en\s+double/i,
  ];
  for (const p of patterns) {
    const m = whole.match(p);
    if (!m) continue;
    if (m[1]) {
      const n = parseInt(m[1], 10);
      if (n > 1) return String(n);
    }
    return "2";
  }
  return "";
}

/** Détecte si le cadre est soufflé en hauteur, en largeur ou les deux. */
function extractSouffle(allRowValues: string[]): string {
  const whole = allRowValues.join(" ");
  if (!/souffl/i.test(whole)) return "";

  const hauteur = /souffl\w*[^.;|]{0,40}\b(hauteur|haut\b|htr)/i.test(whole)
    || /\b(hauteur|haut)\b[^.;|]{0,40}souffl/i.test(whole);
  const largeur = /souffl\w*[^.;|]{0,40}\b(largeur|large\b|lrg)/i.test(whole)
    || /\b(largeur|large)\b[^.;|]{0,40}souffl/i.test(whole);
  const deux = /souffl\w*[^.;|]{0,40}\b(2|deux|les\s*2|both)\s*(c[oô]t[ée]s?|sens|directions?)?/i.test(whole);

  if ((hauteur && largeur) || deux) return "Haut. + Larg.";
  if (hauteur) return "Hauteur";
  if (largeur) return "Largeur";
  // Direction inconnue : on ne devine pas — la cellule reste vide.
  return "";
}


/** Type de seuil : Sans seuil / Seuil adapté AC5 / Seuil adapté / Seuil AC5. */
function extractSeuil(allRowValues: string[]): string {
  const whole = allRowValues.join(" ");
  if (/sans\s+seuil/i.test(whole)) return "Sans seuil";
  const adapte = /seuil\s+adapt/i.test(whole);
  const ac5 = /\bAC5\b/i.test(whole);
  if (adapte && ac5) return "Seuil adapté AC5";
  if (adapte) return "Seuil adapté";
  if (ac5) return "Seuil AC5";
  return "";
}

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
    if (/\bMAB\b/i.test(v)) {
      if (/\bMAB\b\s*(en\s*)?J\b/i.test(v)) return true;
      if (/\bJ\b/.test(v.replace(/J-\d+/g, ""))) return true;
      return true; // any MAB mention on an alu line is excluded
    }
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

/** Détecte une couleur différente de la couleur principale (utile pour Alu int). */
function findDifferentColor(values: string[], mainColor: string): string {
  const mainWord = mainColor.split(" ")[0].toLowerCase();
  for (const v of values) {
    const m = v.match(/\(\s*(P-\s*\d{2,4})\s*\)/i);
    if (m) {
      const code = m[1].replace(/\s+/g, "").toUpperCase();
      if (!mainColor.toUpperCase().includes(code)) return code;
    }
  }
  for (const c of COLOR_WORDS) {
    if (mainWord === c.toLowerCase()) continue;
    for (const v of values) {
      if (new RegExp(`\\b${c}\\b`, "i").test(v)) return c;
    }
  }
  return "";
}

const MEASURE_RE = /\d+\s+\d+\/\d+\s*"?|\d+\/\d+\s*"?|\d+\s*"/;
/** Deux mesures reliées par « x » (ex. 10 1/2 x 30 1/4). */
const DOUBLE_MEASURE_RE = new RegExp(
  `(?:${MEASURE_RE.source})(?:\\s*[x×]\\s*(?:${MEASURE_RE.source}))+`,
  "i",
);
function matchMesure(text: string): string {
  const dbl = text.match(DOUBLE_MEASURE_RE);
  if (dbl) return dbl[0].trim();
  const single = text.match(MEASURE_RE);
  return single ? single[0].trim() : "";
}

/** Toutes les mentions de moulure à brique (M.A.B), variantes incluses. */
const MOULURE_BRIQUE_RE =
  /(?:moulure|moul\.?)\s*(?:[àa]|de|d')?\s*brique|\bm\.?\s*a\.?\s*b\.?\b/gi;

/** Marqueur « en J » (en J, «J», -J, J tout seul) juste après la mention. */
const J_MARKER_RE = /^[\s.:,'"«»\-–]*(?:en\s*)?[«"']?\s*j\b/i;

/** Variantes descriptives telles que « Tout P.V.C. avec "J" intégré ». */
const J_DESCRIPTION_RE =
  /\b(?:avec|en)\s*[«"']?\s*j\s*[»"']?(?:\s+int[ée]gr[ée]?)?/i;

/** Vrai si la ligne contient au moins une moulure à brique qui n'est PAS « en J ». */
function hasMoulureBrique(value: string): boolean {
  const text = value ?? "";
  MOULURE_BRIQUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let found = false;
  while ((m = MOULURE_BRIQUE_RE.exec(text)) !== null) {
    const after = text.slice(m.index + m[0].length);
    if (J_MARKER_RE.test(after) || J_DESCRIPTION_RE.test(after)) continue;
    found = true;
  }
  return found;
}

/** Vrai si au moins une moulure à brique de la ligne est décrite comme étant en J. */
function hasMoulureBriqueEnJ(value: string): boolean {
  const text = value ?? "";
  MOULURE_BRIQUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MOULURE_BRIQUE_RE.exec(text)) !== null) {
    const after = text.slice(m.index + m[0].length);
    if (J_MARKER_RE.test(after) || J_DESCRIPTION_RE.test(after)) return true;
  }
  return false;
}


/**
 * Vrai seulement si « non standard » apparaît plus loin dans le texte qu'une
 * mention « moulure à brique » (pas nécessairement collée à elle).
 */
function isMoulureBriqueNonStandard(allRowValues: string[]): boolean {
  return allRowValues.some((v) => {
    const text = v ?? "";
    MOULURE_BRIQUE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MOULURE_BRIQUE_RE.exec(text)) !== null) {
      const after = text.slice(m.index + m[0].length);
      if (/non[\s-]*std(?:andard|\.)?/i.test(after)) return true;
    }
    return false;
  });
}

/**
 * Mesure d'une MAB non standard. On ignore toutes les mesures situées avant
 * « moulure à brique … non standard », puis on cherche plus loin une mention
 * « mesure MAB », « mesure moulure » ou « mesure moulure à brique ».
 */
function findNonStandardMabMesure(allRowValues: string[]): string {
  const whole = allRowValues.join(" | ");
  MOULURE_BRIQUE_RE.lastIndex = 0;

  let moulureMatch: RegExpExecArray | null;
  while ((moulureMatch = MOULURE_BRIQUE_RE.exec(whole)) !== null) {
    const afterMoulureIndex = moulureMatch.index + moulureMatch[0].length;
    const afterMoulure = whole.slice(afterMoulureIndex);
    const nonStandard = /non[\s-]*std(?:andard|\.)?/i.exec(afterMoulure);
    if (!nonStandard) continue;

    const afterNonStandard = afterMoulure.slice(
      nonStandard.index + nonStandard[0].length,
    );

    // 1) Mesure explicitement étiquetée (mesure MAB / mesure moulure …).
    const measureLabel =
      /mesure\s*(?:de\s*(?:la\s*)?)?(?:m\.?\s*a\.?\s*b\.?|moulure(?:\s*[àa]\s*brique)?)?\s*:?/gi;
    let labelMatch: RegExpExecArray | null;
    while ((labelMatch = measureLabel.exec(afterNonStandard)) !== null) {
      const afterLabel = afterNonStandard.slice(
        labelMatch.index + labelMatch[0].length,
      );
      const mesure = matchMesure(afterLabel);
      if (mesure) return mesure;
    }

    // 2) Sinon, première mesure double puis simple rencontrée après « non standard ».
    const mesure = matchMesure(afterNonStandard);
    if (mesure) return mesure;
  }
  return "";
}



/** Astragale / Moulure / Jardin / Modulaire / Alu int / head thickness note, combined in one column. */

function buildAstragaleDimMab(
  values: string[],
  allRowValues: string[],
  epaisseurJambage: string,
  sensRow: string,
  couleur: string,
): string {
  const parts: string[] = [];
  const astragale = extractAstragale(allRowValues, sensRow);
  if (astragale) parts.push(astragale);
  const moulureTypes = new Set<string>();
  const wholeRow = allRowValues.join(" | ");
  const hasJBrickDescription = hasMoulureBriqueEnJ(wholeRow);
  for (const v of values) {
    if (/moulure\s+de\s+retenu/i.test(v)) moulureTypes.add("Moulure de retenu");
    // Toute description « avec J / J intégré » de la même ligne annule la moulure à brique.
    if (!hasJBrickDescription && hasMoulureBrique(v)) moulureTypes.add("Moulure à brique");
  }


  if (moulureTypes.has("Moulure à brique")) {
    const nonStd = isMoulureBriqueNonStandard(allRowValues);
    if (nonStd) {
      const mesure = findNonStandardMabMesure(allRowValues);
      moulureTypes.delete("Moulure à brique");
      moulureTypes.add(["MAB non std", mesure].filter(Boolean).join(" "));
    }
  }



  parts.push(...moulureTypes);

  if (values.some((v) => /jardin/i.test(v))) parts.push("Jardin");
  if (values.some((v) => /modulaire/i.test(v))) parts.push("Modulaire");

  const aluInt = allRowValues.some((v) => /recouvrement\s+int[ée]rieur\s+aluminium/i.test(v));
  if (aluInt) {
    const aluIntColor = findDifferentColor(allRowValues, couleur);
    parts.push(aluIntColor ? `Alu int ${aluIntColor}` : "Alu int");
  }

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

    const couleur = extractCouleur(r, values, aluCell);
    kept.push({
      sequence,
      id: extractId(toStr(r.Code)),
      sens,
      tete: extractTete(toStr(r.Dimension)),
      jambageLargeur: extractJambageLargeur(aluCell, values),
      jambageEpaisseur: epaisseurJambage,
      jambageHauteur: dims.hauteur,
      astragale: buildAstragaleDimMab(values, allRowValues, epaisseurJambage, sens, couleur),
      moustiquaire: extractMoustiquaire(allRowValues),
      seuil: extractSeuil(allRowValues),
      souffle: extractSouffle(allRowValues),
      dummy: extractDummy(allRowValues),
      enfigure: extractEnfigure(allRowValues),
      couleur,
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
  "MST",
  "SEUIL",
  "SOUFFLÉ",
  "DUMMY",
  "ENFIGURÉ",
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
  // Largeurs ajustées pour 14 colonnes : Moust./Seuil ne se touchent plus.
  const ratios = [
    0.05, 0.07, 0.04, 0.07, 0.07, 0.07, 0.065, 0.155, 0.03, 0.085, 0.06, 0.06, 0.105, 0.07,
  ];

  const widths = ratios.map((r) => usableWidth * r);
  const headerHeight = 30;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const fontSize = 7.5;
  const lineHeight = 10;
  const headerFontSize = 6;
  const headerLineHeight = 7.5;

  // Découpe un texte d'en-tête en lignes qui tiennent dans la colonne.
  const wrapHeader = (text: string, maxWidth: number): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (bold.widthOfTextAtSize(candidate, headerFontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
    return lines;
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
      const lines = wrapHeader(h, widths[i] - 6);
      const totalH = lines.length * headerLineHeight;
      let ty = y - (headerHeight - totalH) / 2 - headerFontSize;
      for (const line of lines) {
        page.drawText(line, { x: x + 3, y: ty, size: headerFontSize, font: bold, color: rgb(0, 0, 0) });
        ty -= headerLineHeight;
      }
      x += widths[i];
    });
    y -= headerHeight;
  };


  // Découpe un texte en plusieurs lignes qui tiennent dans la largeur donnée.
  const wrap = (text: string, maxWidth: number): string[] => {
    if (!text) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of text.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
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
    const cells = [
      r.sequence,
      r.id,
      r.sens,
      r.tete,
      r.jambageLargeur,
      r.jambageEpaisseur,
      r.jambageHauteur,
      r.astragale,
      r.moustiquaire,
      r.seuil,
      r.souffle,
      r.dummy,
      r.enfigure,
      
      r.couleur,
    ];
    // Chaque cellule peut occuper plusieurs lignes (ex. « Moulure » sous l'astragale).
    const wrapped = cells.map((v, i) => wrap(v, widths[i] - 8));
    const height = Math.max(...wrapped.map((l) => l.length)) * lineHeight + 6;

    if (y - height < margin) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeader();
    }
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: margin,
        y: y - height,
        width: usableWidth,
        height,
        color: rgb(0.97, 0.97, 0.97),
      });
    }
    let x = margin;
    wrapped.forEach((lines, i) => {
      lines.forEach((line, li) => {
        page.drawText(line, {
          x: x + 4,
          y: y - 4 - (li + 1) * lineHeight + 3,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      });
      x += widths[i];
    });
    y -= height;
  });

  return await doc.save();
}
