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

/**
 * Détecte si le cadre est soufflé en hauteur, en largeur ou les deux,
 * avec la mesure associée. Les mentions « soufflage » sont ignorées :
 * le texte doit dire « soufflé / soufflée / soufflés / souffler ».
 */
const SOUFFLE_WORD_RE = /souffl[ée]e?(?:s|r)?\b/gi;

/** Toutes les mesures d'un texte, dans l'ordre, avec leur position. */
const ANY_MEASURE_G =
  /\d+\s*\d+\/\d+|\d+-\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?/g;

function listMesures(text: string): { value: string; index: number }[] {
  const out: { value: string; index: number }[] = [];
  ANY_MEASURE_G.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANY_MEASURE_G.exec(text)) !== null) {
    out.push({ value: m[0].replace(/\s+/g, " ").trim(), index: m.index });
  }
  return out;
}

/** Convertit une mesure textuelle en valeur décimale (prend la 1re partie d'une mesure double). */
function measureToDecimal(m: string): number | null {
  const s = m.replace(/"|''/g, "").replace(/\s*(?:po|mm|cm|pouces?)\b/gi, "").trim();
  const first = s.split(/[x×]/)[0].trim();
  if (first.includes("/")) {
    const parts = first.split(/\s+/);
    let total = 0;
    for (const p of parts) {
      if (p.includes("/")) {
        const [num, den] = p.split("/");
        total += parseInt(num, 10) / parseInt(den, 10);
      } else {
        total += parseFloat(p.replace(",", ".")) || 0;
      }
    }
    return total;
  }
  const n = parseFloat(first.replace(",", "."));
  return isNaN(n) ? null : n;
}

/** Ignore les mesures de 0 à 1.9 (souvent la profondeur) et retourne la suivante. */
function skipSmallMesures(mesures: { value: string; index: number }[]): { value: string; index: number }[] {
  return mesures.filter((x) => {
    const n = measureToDecimal(x.value);
    return n === null || n > 1.9;
  });
}

/**
 * Dans un segment « souffler ... », le texte mentionne d'abord la profondeur
 * (« mesure de profondeur X » ou « pleine profondeur ») puis, en 2e mesure,
 * la mesure réelle du soufflé. Les mesures de 0 à 1.9 sont ignorées pour
 * atteindre la vraie mesure du soufflé.
 */
function parseSouffleSegment(after: string): { prof: string; mesure: string } {
  const pleine = /pleine\s+profondeur/i.exec(after);
  const prof = /profond(?:eur)?/i.exec(after);
  const mesures = listMesures(after);

  if (pleine) {
    const next = skipSmallMesures(mesures).find((x) => x.index > pleine.index + pleine[0].length);
    return { prof: "pleine prof.", mesure: next?.value ?? "" };
  }
  if (prof) {
    const end = prof.index + prof[0].length;
    // mesure de profondeur : la plus proche (avant ou après le mot)
    const afterProf = mesures.filter((x) => x.index > end);
    const beforeProf = mesures.filter((x) => x.index < prof.index);
    let profVal = "";
    let rest = afterProf;
    if (afterProf.length > 0) {
      profVal = afterProf[0].value;
      rest = afterProf.slice(1);
    } else if (beforeProf.length > 0) {
      profVal = beforeProf[beforeProf.length - 1].value;
    }
    const real = skipSmallMesures(rest)[0]?.value ?? "";
    return { prof: profVal ? `prof. ${profVal}` : "", mesure: real };
  }
  // Pas de mot profondeur : on ignore la première petite mesure et on prend la suivante.
  const candidates = skipSmallMesures(mesures);
  return { prof: "", mesure: candidates[0]?.value ?? matchMesure(after) };
}

function extractSouffle(allRowValues: string[]): string {
  const whole = allRowValues.join(" ");
  SOUFFLE_WORD_RE.lastIndex = 0;

  // Repère toutes les occurrences de « soufflé/souffler ».
  const occurrences: number[] = [];
  let om: RegExpExecArray | null;
  while ((om = SOUFFLE_WORD_RE.exec(whole)) !== null) {
    occurrences.push(om.index + om[0].length);
  }

  let hauteur = "";
  let largeur = "";
  let hauteurFound = false;
  let largeurFound = false;

  const H_RE = /\b(hauteur|haut|htr)\b/gi;
  const L_RE = /\b(largeur|large|lrg)\b/gi;

  const nearestDistance = (re: RegExp, start: number, segment: string, before: string): number => {
    re.lastIndex = 0;
    let best = Infinity;
    let m: RegExpExecArray | null;
    while ((m = re.exec(segment)) !== null) best = Math.min(best, m.index);
    re.lastIndex = 0;
    while ((m = re.exec(before)) !== null) {
      best = Math.min(best, before.length - m.index);
    }
    void start;
    return best;
  };

  for (let i = 0; i < occurrences.length; i++) {
    const start = occurrences[i];
    // Chaque occurrence est traitée séparément : le segment s'arrête au
    // prochain « soufflé », pour ne jamais mélanger hauteur et largeur.
    const nextStart = i + 1 < occurrences.length ? occurrences[i + 1] : whole.length;
    const segment = whole.slice(start, Math.min(nextStart, start + 160));
    const before = whole.slice(Math.max(0, start - 60), start);

    const dH = nearestDistance(H_RE, start, segment, before);
    const dL = nearestDistance(L_RE, start, segment, before);
    if (dH === Infinity && dL === Infinity) continue;

    const { prof, mesure } = parseSouffleSegment(segment);
    const txt = [mesure, prof ? `(${prof})` : ""].filter(Boolean).join(" ");

    // Une occurrence = une seule direction (la plus proche).
    if (dH <= dL) {
      hauteurFound = true;
      if (txt && !hauteur) hauteur = txt;
    } else {
      largeurFound = true;
      if (txt && !largeur) largeur = txt;
    }
  }

  const label = (name: string, mes: string) => (mes ? `${name} ${mes}` : name);
  if (hauteurFound && largeurFound) {
    return `${label("Haut.", hauteur)} + ${label("Larg.", largeur)}`;
  }
  if (hauteurFound) return label("Hauteur", hauteur);
  if (largeurFound) return label("Largeur", largeur);
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

/**
 * Détecte une mention de pleine profondeur ou de profondeur explicite.
 * "pleine profondeur 1 1/4" -> "Pleine profondeur 1 1/4"
 * "profond 1 1/4" -> "1 1/4"
 */
function extractPleineProfondeur(values: string[]): string {
  const whole = values.join(" ");
  const pleine = whole.match(/pleine\s+profondeur(?:\s+(\d+(?:[-\s]\d+\/\d+)?)\s*''?)?/i);
  if (pleine) {
    return pleine[1] ? `Pleine profondeur ${normalizeFraction(pleine[1])}` : "Pleine profondeur";
  }
  const prof = whole.match(/\bprofond(?:eur)?\s+(\d+(?:[-\s]\d+\/\d+)?)\s*''?/i);
  if (prof) return normalizeFraction(prof[1]);
  return "";
}

/**
 * Détecte une mention de pleine hauteur. Si une mesure suit, elle est ajoutée.
 * Sinon on retourne la hauteur par défaut (issue de la dimension).
 */
function extractPleineHauteur(values: string[], defaultHauteur: string): string {
  const whole = values.join(" ");
  const pleine = whole.match(/pleine\s+hauteur(?:\s+(\d+(?:[-\s]\d+\/\d+)?)\s*''?)?/i);
  if (pleine) {
    return pleine[1] ? `Pleine hauteur ${normalizeFraction(pleine[1])}` : "Pleine hauteur";
  }
  return defaultHauteur;
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

// Mesure dans n'importe quel format : entiers, décimales, fractions
// (10 1/2, 10-1/2, 1/2), avec ou sans symbole " / po / mm.
const MEASURE_RE =
  /\d+(?:[.,]\d+)?(?:[\s-]+\d+\/\d+)?\s*(?:"|''|po\b|mm\b)?|\d+\/\d+\s*(?:"|''|po\b|mm\b)?/i;
/** Deux mesures reliées par « x » (ex. 10 1/2 x 30 1/4). */
const DOUBLE_MEASURE_RE = new RegExp(
  `(?:${MEASURE_RE.source})(?:\\s*[x×]\\s*(?:${MEASURE_RE.source}))+`,
  "i",
);
/** Une mesure « crédible » : double, ou avec fraction/décimale/unité. */
const QUALIFIED_MEASURE_RE =
  /\d+(?:[.,]\d+)(?:\s*(?:"|''|po\b|mm\b))?|\d+[\s-]+\d+\/\d+\s*(?:"|''|po\b|mm\b)?|\d+\/\d+\s*(?:"|''|po\b|mm\b)?|\d+\s*(?:"|''|po\b|mm\b)/i;
function matchMesure(text: string): string {
  const dbl = text.match(DOUBLE_MEASURE_RE);
  if (dbl) return dbl[0].trim();
  const single = text.match(QUALIFIED_MEASURE_RE);
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

const NON_INSTALLE_RE = /non[\s\-]?install[ée]?/i;

/** Vrai si « non installé » touche immédiatement la mention (avant ou après). */
function isNonInstalleAdjacent(text: string, m: RegExpExecArray): boolean {
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  if (NON_INSTALLE_RE.test(before.slice(-60))) return true;
  if (NON_INSTALLE_RE.test(after.slice(0, 60))) return true;
  return false;
}

/** Vrai si une mention « non installé » côtoie une moulure à brique n'importe où dans la ligne. */
function hasNonInstalleMab(wholeRow: string): boolean {
  MOULURE_BRIQUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MOULURE_BRIQUE_RE.exec(wholeRow)) !== null) {
    if (isNonInstalleAdjacent(wholeRow, m)) return true;
  }
  return false;
}


/** Vrai si la ligne contient au moins une moulure à brique qui n'est PAS « en J » ni « non installé ». */
function hasMoulureBrique(value: string): boolean {
  const text = value ?? "";
  MOULURE_BRIQUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let found = false;
  while ((m = MOULURE_BRIQUE_RE.exec(text)) !== null) {
    if (isNonInstalleAdjacent(text, m)) continue;
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
    if (isNonInstalleAdjacent(text, m)) continue;
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
  const scan = (text: string) => {
    MOULURE_BRIQUE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MOULURE_BRIQUE_RE.exec(text)) !== null) {
      if (isNonInstalleAdjacent(text, m)) continue;
      const after = text.slice(m.index + m[0].length);
      if (/non[\s-]*(standard|std)\b/i.test(after)) return true;
    }
    return false;
  };
  // Par cellule, puis sur la ligne entière (la mention peut être répartie
  // sur deux colonnes consécutives).
  return allRowValues.some((v) => scan(v ?? "")) || scan(allRowValues.join(" | "));
}

/** Mesure « brute » : n'importe quel nombre/fraction, simple ou double. */
const LOOSE_MEASURE_RE =
  /\d+(?:[.,]\d+)?(?:\s*\d+\s*\/\s*\d+)?(?:\s*(?:"|''|po|pouces?|mm|cm)\b)?(?:\s*(?:x|×|par)\s*\d+(?:[.,]\d+)?(?:\s*\d+\s*\/\s*\d+)?(?:\s*(?:"|''|po|pouces?|mm|cm)\b)?)?/i;

/**
 * Mesure d'une MAB non standard : on cherche la mention « commentaire »
 * (peu importe la colonne) et on prend la première mesure qui la suit.
 * Plusieurs niveaux de repli pour ne jamais rater la mesure.
 */
function findNonStandardMabMesure(allRowValues: string[]): string {
  const whole = allRowValues.join(" | ");

  // 1) Mesure qualifiée juste après « commentaire ».
  const re = /commentaires?/gi;
  const afterComments: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(whole)) !== null) {
    const after = whole.slice(m.index + m[0].length);
    afterComments.push(after);
    const mesure = matchMesure(after);
    if (mesure) return mesure;
  }

  // 2) Mesure « brute » après « commentaire ».
  for (const after of afterComments) {
    const loose = after.match(LOOSE_MEASURE_RE);
    if (loose) return loose[0].trim().replace(/\s+/g, " ");
  }

  // 3) Mesure après la mention « non standard ».
  const ns = whole.match(/non[\s-]*(?:standard|std)\b/i);
  if (ns) {
    const after = whole.slice((ns.index ?? 0) + ns[0].length);
    const mesure = matchMesure(after) || (after.match(LOOSE_MEASURE_RE)?.[0] ?? "");
    if (mesure) return mesure.trim().replace(/\s+/g, " ");
  }

  // 4) Première cellule non vide qui suit la cellule contenant « commentaire ».
  const idx = allRowValues.findIndex((v) => /commentaires?/i.test(v ?? ""));
  if (idx >= 0) {
    for (let i = idx + 1; i < allRowValues.length; i++) {
      const cell = (allRowValues[i] ?? "").trim();
      if (!cell) continue;
      if (!/\d/.test(cell)) continue;
      const loose = cell.match(LOOSE_MEASURE_RE);
      if (loose) return loose[0].trim().replace(/\s+/g, " ");
    }
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
  const nonInstalle = hasNonInstalleMab(wholeRow);
  for (const v of values) {
    if (/moulure\s+de\s+retenu/i.test(v)) moulureTypes.add("Moulure de retenu");
    // Toute description « avec J / J intégré » ou « non installé » de la même ligne annule la moulure à brique.
    if (!hasJBrickDescription && !nonInstalle && hasMoulureBrique(v))
      moulureTypes.add("Moulure à brique");
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
    const epaisseurJambage = epaisseurs[0] || "";
    const hauteurJambage = extractPleineHauteur(values, dims.hauteur);
    const sens = extractSens(values);

    const couleur = extractCouleur(r, values, aluCell);
    kept.push({
      sequence,
      id: extractId(toStr(r.Code)),
      sens,
      tete: extractTete(toStr(r.Dimension)),
      jambageLargeur: extractJambageLargeur(aluCell, values),
      jambageEpaisseur: epaisseurJambage,
      jambageHauteur: hauteurJambage,
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
