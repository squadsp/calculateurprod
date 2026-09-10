import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import MDBReader from "mdb-reader";

export type { CadreAluRow } from "@/lib/cadresAlu.types";
import type { CadreAluRow } from "@/lib/cadresAlu.types";
import {
  DEFAULT_CADRE_ALU_SETTINGS,
  normalizeCadreAluSettings,
  type CadreAluSettings,
} from "@/lib/cadresAluSettings";

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

/** Ignore les mesures de 0 à 1.9 en début de liste (souvent la profondeur) et retourne la suivante. */
function skipLeadingSmallMesures(mesures: { value: string; index: number }[]): { value: string; index: number }[] {
  let i = 0;
  while (i < mesures.length) {
    const n = measureToDecimal(mesures[i].value);
    if (n === null || n > 1.9) break;
    i++;
  }
  return mesures.slice(i);
}

/**
 * Dans un segment « souffler ... », le texte mentionne d'abord la profondeur
 * (« mesure de profondeur X » ou « pleine profondeur ») puis, en 2e mesure,
 * la mesure réelle du soufflé. Les premières mesures de 0 à 1.9 sont ignorées
 * pour atteindre la vraie mesure du soufflé. Si ce n'est pas « pleine profondeur »,
 * la mesure réelle est toujours mentionnée.
 */
function parseSouffleSegment(after: string): { prof: string; mesure: string } {
  const pleine = /pleine\s+profondeur/i.exec(after);
  const prof = /profond(?:eur)?/i.exec(after);
  const mesures = listMesures(after);

  if (pleine) {
    // « pleine profondeur » : la mesure réelle est celle qui suit directement.
    const after2 = mesures.filter((x) => x.index > pleine.index + pleine[0].length);
    const next = after2[0];
    return { prof: "pleine prof.", mesure: next?.value ?? "" };
  }
  if (prof) {
    const end = prof.index + prof[0].length;
    // Format type : « ... de 0" à 1.9" - 15/16" de profondeur 1 1/8 '' »
    // → profondeur = mesure juste avant « profondeur », mesure réelle = celle qui suit.
    const beforeProf = mesures.filter((x) => x.index < prof.index);
    const afterProf = mesures.filter((x) => x.index > end);
    const profVal = beforeProf[beforeProf.length - 1]?.value ?? "";
    const real = afterProf[0]?.value ?? "";
    return { prof: profVal ? `${profVal} profond` : "", mesure: real };
  }
  // Pas de mot profondeur : on ignore la première petite mesure et on prend la suivante.
  const candidates = skipLeadingSmallMesures(mesures);
  let mesure = candidates[0]?.value ?? "";
  if (!mesure) mesure = matchMesure(after);
  return { prof: "", mesure };
}

function extractSouffle(allRowValues: string[]): string {
  let hauteur = "";
  let largeur = "";
  let hauteurFound = false;
  let largeurFound = false;

  const H_RE = /\b(hauteur|haut|htr)\b/gi;
  const L_RE = /\b(largeur|large|lrg)\b/gi;

  const nearest = (re: RegExp, text: string): number => {
    re.lastIndex = 0;
    let best = Infinity;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) best = Math.min(best, m.index);
    return best;
  };

  // On analyse chaque valeur (chaque « ligne ») séparément : la mesure doit
  // provenir exactement de la même valeur que la mention soufflé/hauteur/largeur.
  for (const raw of allRowValues) {
    const value = (raw ?? "").toString();
    if (!value.trim()) continue;

    SOUFFLE_WORD_RE.lastIndex = 0;
    const occurrences: number[] = [];
    let om: RegExpExecArray | null;
    while ((om = SOUFFLE_WORD_RE.exec(value)) !== null) {
      occurrences.push(om.index + om[0].length);
    }
    if (occurrences.length === 0) continue;

    for (let i = 0; i < occurrences.length; i++) {
      const start = occurrences[i];
      const nextStart = i + 1 < occurrences.length ? occurrences[i + 1] : value.length;
      const segment = value.slice(start, nextStart);
      const before = value.slice(0, start);

      const dH = Math.min(nearest(H_RE, segment), nearest(H_RE, before) === Infinity ? Infinity : before.length - nearest(H_RE, before));
      const dL = Math.min(nearest(L_RE, segment), nearest(L_RE, before) === Infinity ? Infinity : before.length - nearest(L_RE, before));
      if (dH === Infinity && dL === Infinity) continue;

      const { prof, mesure } = parseSouffleSegment(segment);
      const txt = [mesure, prof ? `(${prof})` : ""].filter(Boolean).join(" ");

      if (dH <= dL) {
        hauteurFound = true;
        if (txt && !hauteur) hauteur = txt;
      } else {
        largeurFound = true;
        if (txt && !largeur) largeur = txt;
      }
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

function findAluCell(values: string[], keywords: string[]): string | null {
  const re = new RegExp(`\\b(?:${keywords.map(escapeRe).join("|")})\\b`, "i");
  for (const v of values) {
    if (re.test(v)) return v;
  }
  return null;
}

/** MAB en J, MAB J, or MAB alone next to a lone "J" -> excluded. */
function isExcluded(values: string[], keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const re = new RegExp(`\\b(?:${keywords.map(escapeRe).join("|")})\\b`, "i");
  for (const v of values) {
    if (re.test(v)) {
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

/** Convertit une valeur décimale en mesure fractionnaire (au 1/16 près). */
function decimalToMeasure(n: number): string {
  if (!isFinite(n) || n <= 0) return "";
  const whole = Math.floor(n);
  let num = Math.round((n - whole) * 16);
  let den = 16;
  if (num === 16) return `${whole + 1}`;
  if (num === 0) return `${whole}`;
  while (num % 2 === 0 && den % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`;
}

/** Profondeur du soufflage mentionnée sur la ligne (ex. « profondeur 1 1/4 »). */
function extractSouffleProfondeur(allValues: string[]): number | null {
  for (const v of allValues) {
    if (!/souffl(?:é|ée|és|er)/i.test(v)) continue;
    const m = v.match(/(\d+(?:\s+\d+\/\d+)?|\d+-\d+\/\d+|\d+\/\d+)\s*''?\s*(?:de\s+)?profond(?:eur)?/i);
    if (m) {
      const d = measureToDecimal(normalizeFraction(m[1]));
      if (d !== null) return d;
    }
    const m2 = v.match(/profond(?:eur)?\s*(?:de\s*)?(\d+(?:\s+\d+\/\d+)?|\d+-\d+\/\d+|\d+\/\d+)/i);
    if (m2) {
      const d = measureToDecimal(normalizeFraction(m2[1]));
      if (d !== null) return d;
    }
  }
  return null;
}

/** Profondeur (ou dimension) du cadre mentionnée sur la ligne. */
function extractCadreProfondeur(allValues: string[]): number | null {
  for (const v of allValues) {
    const m =
      v.match(/profondeur\s*(?:du|de)\s*cadre[^0-9]{0,20}(\d+(?:\s+\d+\/\d+)?|\d+-\d+\/\d+|\d+\/\d+)/i) ||
      v.match(/cadre[^0-9]{0,20}profondeur[^0-9]{0,10}(\d+(?:\s+\d+\/\d+)?|\d+-\d+\/\d+|\d+\/\d+)/i) ||
      v.match(/(?:dimension|dim\.?)\s*(?:du|de)?\s*cadre[^0-9]{0,20}(\d+(?:\s+\d+\/\d+)?|\d+-\d+\/\d+|\d+\/\d+)/i);
    if (m) {
      const d = measureToDecimal(normalizeFraction(m[1]));
      if (d !== null) return d;
    }
  }
  return null;
}

function extractJambageLargeur(aluCell: string, allValues: string[]): string {
  const fromAlu = aluCell.match(/Cadre\s*(\d+(?:[-\s]\d+\/\d+)?)\s*''/i);
  if (fromAlu) return normalizeFraction(fromAlu[1]);
  for (const v of allValues) {
    const m = v.match(/Cadre\s*(\d+(?:[-\s]\d+\/\d+)?)\s*''/i);
    if (m) return normalizeFraction(m[1]);
  }
  // Repli : « Cadre dimension X '' » moins la profondeur du soufflage (« Souf. extérieur Y '' »).
  const M = String.raw`\d+\s+\d+\/\d+|\d+-\d+\/\d+|\d+\/\d+|\d+`;
  let cadreDim: number | null = null;
  let souf = 0;
  for (const v of allValues) {
    if (cadreDim === null) {
      const m = v.match(new RegExp(String.raw`cadre\s+dimensions?\s*(?:de\s*)?(?:\([^)]*\)\s*)?(${M})\s*''`, "i"));
      if (m) cadreDim = measureToDecimal(normalizeFraction(m[1]));

    }
    const s = v.match(new RegExp(String.raw`souf(?:f|\.)?\w*\.?\s*(?:ext[ée]rieur|int[ée]rieur)?\s*(${M})`, "i"));
    if (s) souf = Math.max(souf, measureToDecimal(normalizeFraction(s[1])) ?? 0);
  }
  if (cadreDim !== null && cadreDim > 0) {
    const result = cadreDim - souf;
    if (result > 0) return decimalToMeasure(result);
  }
  // Repli : profondeur/dimension du cadre moins la profondeur du soufflage.
  const cadre = extractCadreProfondeur(allValues);
  if (cadre !== null) {
    const souffle = extractSouffleProfondeur(allValues) ?? 0;
    const result = cadre - souffle;
    if (result > 0) return decimalToMeasure(result);
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

/** Opening direction: keep the full parenthesis content (ex "(gauche int #1)"). */
function extractSens(values: string[]): string {
  for (const v of values) {
    const parens = [...v.matchAll(/\(([^()]*)\)/g)];
    for (const p of parens) {
      const inner = p[1].trim();
      if (/gauche|droite|fixe/i.test(inner) && inner) {
        return inner.charAt(0).toUpperCase() + inner.slice(1);
      }
    }
  }
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
    const m = scope.match(/\b(gauche|droite)\b/i) ?? sensRow.match(/\b(gauche|droite|fixe)\b/i);
    if (m) {
      const w = m[1].toLowerCase();
      sens = w === "gauche" ? "Gauche" : w === "droite" ? "Droite" : "Fixe";
    }
  }


  return sens ? `${size} ${sens}` : size;
}

/** Compare deux couleurs (nom + code) en ignorant accents, casse,
 *  ponctuation et préfixes de code (P-514 ≡ 514). */
function sameColor(a: string, b: string): boolean {
  const key = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b[a-z]{1,3}-(?=\d)/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const ka = key(a);
  const kb = key(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

/** Détecte une couleur du catalogue différente de la couleur principale
 *  (utile pour « Alu int »). Aucune couleur inventée : elle doit exister
 *  dans la liste de couleurs. */

function findDifferentColor(
  values: string[],
  mainColor: string,
  catalogue: CouleurCatalogue,
): string {
  for (const v of values) {
    const hit = matchCouleurInText(v, catalogue);
    if (hit && !sameColor(hit, mainColor)) return hit;
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





/**
 * Imposte : si la ligne mentionne une imposte, on remplace la mesure de hauteur
 * de jambage par le type d'imposte (fenêtre ou modulaire).
 */
function extractImposte(allRowValues: string[]): string {
  const cell = allRowValues.find((v) => /\bimposte/i.test(v));
  if (!cell) return "";
  const whole = allRowValues.join(" | ");
  if (/modulaire/i.test(cell) || /imposte[^|]{0,60}modulaire|modulaire[^|]{0,60}imposte/i.test(whole))
    return "Imposte modulaire";
  if (/fen[êe]tre/i.test(cell) || /imposte[^|]{0,60}fen[êe]tre|fen[êe]tre[^|]{0,60}imposte/i.test(whole))
    return "Imposte fenêtre";
  return "Imposte";
}

/** Astragale / Moulure / Jardin / Modulaire / Alu int / head thickness note, combined in one column. */

function buildAstragaleDimMab(
  values: string[],
  allRowValues: string[],
  epaisseurJambage: string,
  sensRow: string,
  couleur: string,
  catalogue: CouleurCatalogue,
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
  if (allRowValues.some((v) => /penture[s]?\s+suppl[ée]mentaire/i.test(v)))
    parts.push("Penture supplémentaire");
  if (allRowValues.some((v) => /machin(?:er|age|é|e)?\s+(?:la\s+)?g[âa]che/i.test(v)))
    parts.push("Machiner gâche");

  const aluIntRe = /(?:recouvrement\s+)?int[ée]rieur\s+alu(?:m(?:inium)?)?\b/i;
  const aluIntCell = allRowValues.find((v) => aluIntRe.test(v));
  if (aluIntCell) {
    const tail = aluIntCell.slice(aluIntCell.search(aluIntRe));
    const aluIntColor =
      matchCouleurInText(tail, catalogue) ||
      literalColorInText(tail, catalogue) ||
      findDifferentColor(allRowValues, couleur, catalogue);
    parts.push(
      aluIntColor && !sameColor(aluIntColor, couleur) ? `Alu int ${aluIntColor}` : "Alu int",
    );
  }


  if (epaisseurJambage === "1 1/2") {
    const teteEp = values.find((v) => /t[êe]te/i.test(v) && /1[-\s]1\/4/.test(v));
    if (teteEp) parts.push("Tête 1 1/4");
  }
  return parts.join(" • ");
}


const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const titleCase = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

/** Texte normalisé (entouré d'espaces) pour comparer avec les noms du catalogue. */
const normText = (s: string) =>
  ` ${s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")} `;

export type CouleurEntry = { name: string; code: string | null };

type CatalogueEntry = { name: string; key: string; tokens: string[]; codes: string[] };

export type CouleurCatalogue = {
  byFirstWord: Map<string, CatalogueEntry[]>;
  byDigits: Map<string, CatalogueEntry>;
};

const codeDigits = (code: string) => code.replace(/[^0-9]/g, "");

/** Radical d'un mot : ignore le pluriel et le féminin (pur/pure/pures). */
const stem = (w: string) => (w.length > 3 ? w.replace(/(?:es|s|e)$/, "") : w);

const stems = (key: string) => key.split(" ").filter(Boolean).map(stem);

/** Construit l'index de recherche à partir de la liste de couleurs (base de données). */
export function buildCouleurCatalogue(list: CouleurEntry[]): CouleurCatalogue {
  const byKey = new Map<string, CatalogueEntry>();
  for (const item of list) {
    const name = (item.name || "").trim();
    if (!name) continue;
    const key = normText(name).trim();
    if (!key) continue;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { name, key, tokens: stems(key), codes: [] };
      byKey.set(key, entry);
    }
    const code = (item.code || "").trim();
    if (code && !entry.codes.includes(code)) entry.codes.push(code);
  }

  const byFirstWord = new Map<string, CatalogueEntry[]>();
  const byDigits = new Map<string, CatalogueEntry>();
  for (const entry of byKey.values()) {
    const first = entry.tokens[0];
    if (first) {
      const arr = byFirstWord.get(first) ?? [];
      arr.push(entry);
      byFirstWord.set(first, arr);
    }
    for (const code of entry.codes) {
      const d = codeDigits(code);
      if (d.length >= 3 && !byDigits.has(d)) byDigits.set(d, entry);
    }
  }
  for (const arr of byFirstWord.values()) {
    arr.sort((a, b) => b.tokens.length - a.tokens.length || b.key.length - a.key.length);
  }
  return { byFirstWord, byDigits };
}

/** Cherche un code de la liste écrit littéralement dans le texte du MDB. */
function literalCode(entry: CatalogueEntry, text: string): string {
  const t = normText(text);
  const compact = ` ${t.replace(/[^a-z0-9 ]/g, "")} `;
  for (const code of entry.codes) {
    const d = codeDigits(code);
    if (d.length < 3) continue;
    const flat = norm(code).replace(/[^a-z0-9]/g, "");
    if (compact.includes(` ${flat} `) || t.includes(` ${d} `) || t.includes(`#${d}`)) {
      return code.toUpperCase();
    }
  }
  return "";
}

/** Cherche dans un texte une couleur validée par la liste : le nom (au singulier
 *  ou au pluriel/féminin) ET le code doivent être présents dans la ligne du MDB.
 *  Seule exception : « blanc » sans code reste « Blanc ». */
export function matchCouleurInText(text: string, catalogue: CouleurCatalogue): string {
  if (!text || !text.trim()) return "";
  const words = normText(text).split(" ").filter(Boolean);
  const wordStems = words.map(stem);

  let best: CatalogueEntry | null = null;
  for (let i = 0; i < wordStems.length; i++) {
    const candidates = catalogue.byFirstWord.get(wordStems[i] ?? "");
    if (!candidates) continue;
    for (const entry of candidates) {
      if (entry.key.length < 4) continue;
      const toks = entry.tokens;
      if (i + toks.length > wordStems.length) continue;
      let ok = true;
      for (let j = 0; j < toks.length; j++) {
        if (wordStems[i + j] !== toks[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const code = literalCode(entry, text);
      if (code) return `${entry.name} ${code}`;
      if (!best || entry.key.length > best.key.length) best = entry;
      break;
    }
  }

  // Sans code dans la ligne : seul « blanc » est accepté.
  if (best && best.key === "blanc") return "Blanc";
  return "";
}

/* --- Détection directe : « Nom (P-536) », « NOM - #534 », « BENJAMIN MOORE HC-126 » --- */

const CODE_RE =
  /\(\s*([A-Za-z0-9][A-Za-z0-9-]{1,9})\s*\)|#\s*(\d{2,4})\b|\b([A-Za-z]{1,3}-\d{1,6}[A-Za-z0-9]*)\b/g;

/** Code plausible de couleur (exclut les modèles de porte N600, les mesures, etc.). */
function isCodeLike(code: string): boolean {
  const c = code.toUpperCase();
  if (!/\d/.test(c)) return false;
  if (/^N\d{3}$/.test(c)) return false; // modèle de porte
  if (/^\d+X\d+$/.test(c)) return false; // dimensions
  if (/^\d{1,2}$/.test(c)) return false;
  if (/^(STD|LC|PG|DP|CP)\b/.test(c)) return false;
  return c.length >= 3;
}

/** Mots qui ne font jamais partie d'un nom de couleur (arrêtent la lecture). */
const NAME_STOP = new Set([
  "couleur", "couleurs", "special", "speciale", "specialle", "aluminium", "alu",
  "recouvert", "recouverte", "recouvrement", "pin", "cadre", "poteau", "centrale",
  "interieur", "exterieur", "interieure", "exterieure", "peinture", "peinturee",
  "peinturees", "peinture s", "peinturer", "peinture:", "moulure", "brique",
  "seuil", "coupe", "froid", "porte", "portes", "bois", "avec", "sur", "et",
  "cotes", "cote", "identiques", "differents", "developpement", "fournir",
  "echantillon", "intercalaire", "thermo", "volet", "fixe", "vitrail", "std",
  "extra", "dimension", "dimensions", "epaisseur", "barre", "renforcement",
  "pentures", "billes", "machiner", "gache", "percer", "trous", "trou",
  "deluxe", "barrotin", "exte", "ext", "int", "capuchon", "moustiquaire",
]);

const CONNECTORS = new Set(["de", "du", "des", "la", "le", "les", "d", "a", "au", "aux", "l"]);

const cleanWord = (w: string) =>
  w.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ]+$/g, "");

/** Reconstruit le nom de couleur écrit juste avant un code. */
function nameBeforeCode(before: string): string {
  const raw = before.split(/\s+/).filter(Boolean);
  const picked: string[] = [];
  for (let i = raw.length - 1; i >= 0 && picked.length < 4; i--) {
    const w = cleanWord(raw[i] ?? "");
    if (!w) {
      if (picked.length > 0) break;
      continue;
    }
    const n = norm(w);
    if (NAME_STOP.has(n)) break;
    if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(w)) break;
    picked.unshift(w);
  }
  while (picked.length && CONNECTORS.has(norm(picked[0] ?? ""))) picked.shift();
  while (picked.length && CONNECTORS.has(norm(picked[picked.length - 1] ?? ""))) picked.pop();
  if (picked.length === 0) return "";
  return picked
    .map((w, i) => {
      const n = norm(w);
      if (i > 0 && CONNECTORS.has(n)) return n;
      return titleCase(w);
    })
    .join(" ");
}

/** Nom de couleur écrit juste après un code (ex. « OC-9 BALLET WHITE »). */
function nameAfterCode(after: string): string {
  const raw = after.split(/\s+/).filter(Boolean);
  const picked: string[] = [];
  for (const token of raw) {
    const w = cleanWord(token);
    if (!w) {
      if (picked.length > 0) break;
      continue;
    }
    const n = norm(w);
    if (NAME_STOP.has(n)) break;
    if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(w)) break;
    picked.push(w);
    if (picked.length >= 4) break;
  }
  while (picked.length && CONNECTORS.has(norm(picked[picked.length - 1] ?? ""))) picked.pop();
  if (picked.length === 0) return "";
  return picked.map((w, i) => (i > 0 && CONNECTORS.has(norm(w)) ? norm(w) : titleCase(w))).join(" ");
}

/** Couleur écrite littéralement avec son code dans une cellule. */
function literalColorInText(text: string, catalogue: CouleurCatalogue): string {
  if (!text) return "";
  CODE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CODE_RE.exec(text))) {
    const rawCode = (m[1] ?? m[3] ?? "").trim();
    const hashCode = (m[2] ?? "").trim();
    if (rawCode && !isCodeLike(rawCode)) continue;
    const code = rawCode ? rawCode.toUpperCase() : hashCode ? `#${hashCode}` : "";
    if (!code) continue;
    let name = nameBeforeCode(text.slice(0, m.index));
    if (!name || name.length < 3) name = nameAfterCode(text.slice(m.index + m[0].length));
    if (!name || name.length < 3) continue;
    // Si la liste connaît ce nom, on garde son orthographe officielle.
    const key = normText(name).trim();
    const known = (catalogue.byFirstWord.get(key.split(" ")[0] ?? "") ?? []).find(
      (e) => e.key === key,
    );
    return `${known ? known.name : name} ${code}`;
  }
  return "";
}

/** Couleur écrite sans parenthèses dans une cellule dédiée à la couleur,
 *  ex. « GENTEK ROUGE MAJESTUEUX 5C5 intérieur » ou « SICO 232 extérieur ». */
function contextColorInText(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const isColorCell =
    /(int[ée]rieur|ext[ée]rieur)\s*$/i.test(t) || /couleur\s+sp[ée]cial|-\s*special\s*-/i.test(t);
  if (!isColorCell) return "";
  const body = t.replace(/\s*(int[ée]rieur|ext[ée]rieur)\s*$/i, "");
  const tokens = body.split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = (tokens[i] ?? "").replace(/[(),.:;]/g, "");
    if (!isCodeLike(tok)) continue;
    if (!/^[A-Za-z0-9-]+$/.test(tok)) continue;
    const name = nameBeforeCode(tokens.slice(0, i).join(" "));
    if (name && name.length >= 3) return `${name} ${tok.toUpperCase()}`;
    return "";
  }
  return "";
}

/** Lit « Nom [code] » au début d'un texte (après une mention de couleur). */
function parseColorTail(tail: string): string {
  const clean = (tail ?? "").replace(/\s*(int[ée]rieur|ext[ée]rieur)\s*$/i, "").trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  const words: string[] = [];
  let code = "";
  for (const token of tokens) {
    const raw = token.replace(/[(),.:;]/g, "");
    if (isCodeLike(raw) && /^[A-Za-z0-9-]+$/.test(raw)) {
      code = raw.toUpperCase();
      break;
    }
    const w = cleanWord(token);
    if (!w || NAME_STOP.has(norm(w)) || !/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(w)) break;
    words.push(w);
    if (words.length >= 4) break;
  }
  while (words.length && CONNECTORS.has(norm(words[words.length - 1] ?? ""))) words.pop();
  if (words.length === 0) return "";
  const name = words
    .map((w, i) => (i > 0 && CONNECTORS.has(norm(w)) ? norm(w) : titleCase(w)))
    .join(" ");
  if (name.length < 3) return "";
  return code ? `${name} ${code}` : name;
}

/** Repli après « Développement de couleur » : la couleur (et son code s'il
 *  existe) est écrite un peu plus loin, souvent après « -Special- » ou
 *  « Couleur spéciale ». La liste officielle reste vérifiée en premier. */
function colorAfterDevelopment(text: string, catalogue: CouleurCatalogue): string {
  const t = text.trim();
  if (!t) return "";
  const known = matchCouleurInText(t, catalogue);
  if (known) return known;
  const literal = literalColorInText(t, catalogue);
  if (literal) return literal;
  const ctx = contextColorInText(t);
  if (ctx) return ctx;
  const m = t.match(/(?:-\s*sp[ée]cial\s*-|couleur\s+sp[ée]ciale?)\s*(.+)$/i);
  if (!m) return "";
  const tail = (m[1] ?? "").replace(/\s*(int[ée]rieur|ext[ée]rieur)\s*$/i, "").trim();
  const tokens = tail.split(/\s+/).filter(Boolean);
  const words: string[] = [];
  let code = "";
  for (const token of tokens) {
    const raw = token.replace(/[(),.:;]/g, "");
    if (isCodeLike(raw) && /^[A-Za-z0-9-]+$/.test(raw)) {
      code = raw.toUpperCase();
      break;
    }
    const w = cleanWord(token);
    if (!w || NAME_STOP.has(norm(w)) || !/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(w)) break;
    words.push(w);
    if (words.length >= 4) break;
  }
  while (words.length && CONNECTORS.has(norm(words[words.length - 1] ?? ""))) words.pop();
  if (words.length === 0) return "";
  const name = words
    .map((w, i) => (i > 0 && CONNECTORS.has(norm(w)) ? norm(w) : titleCase(w)))
    .join(" ");
  if (name.length < 3) return "";
  return code ? `${name} ${code}` : name;
}

/** Couleur : uniquement à partir de Opt4 et suivants (jamais Opt1-3 ni la
 *  description). On valide d'abord avec la liste, sinon on prend la couleur
 *  écrite telle quelle avec son code. */
/** « Recouvrement intérieur Vinyle blanc », « intérieur PVC blanc » : finition
 *  intérieure en vinyle/PVC — ce n'est pas la couleur de peinture de la ligne. */
const INTERIEUR_PVC_RE =
  /(?:recouvrement\s+)?int[ée]rieur[e]?\s+(?:vinyle|vinyl|pvc|p\.\s*v\.\s*c\.?)(?:\s+[A-Za-zÀ-ÿ'’-]+){0,2}/gi;

/** « Coupe-froid blanc/noir » : quincaillerie, jamais la couleur de la porte. */
const COUPE_FROID_RE = /coupe[\s-]?froid(?:\s+[A-Za-zÀ-ÿ'’-]+){0,2}/gi;

/** Références d'achat / de commande : « REF:ACHAT I-00315552 », « ACHAT: I-00315552 »,
 *  « REF POUR COULEUR: BXN-00446 » — ce sont des numéros, jamais une couleur. */
const REFERENCE_RE =
  /\b(?:r[ée]f\.?|ref)\s*(?:pour\s+couleur)?\s*:?\s*(?:achat)?\s*:?\s*[A-Za-z]{0,3}-?\d[\dA-Za-z-]*/gi;
const ACHAT_RE = /\bachat\s*:?\s*[A-Za-z]{0,3}-?\d[\dA-Za-z-]*/gi;

/** Marque de peinture écrite avant le nom, ex. « Farrow & Ball - Stuffield Green ».
 *  On garde uniquement le nom de la couleur. */
const MARQUE_RE = /\b[A-Za-zÀ-ÿ.]{2,}\s*&\s*[A-Za-zÀ-ÿ.]{2,}\s*-\s*/gi;

/** Retire les mentions qui ne décrivent pas la couleur de la porte. */
function stripNonCouleur(text: string): string {
  if (!text) return "";
  INTERIEUR_PVC_RE.lastIndex = 0;
  COUPE_FROID_RE.lastIndex = 0;
  REFERENCE_RE.lastIndex = 0;
  ACHAT_RE.lastIndex = 0;
  MARQUE_RE.lastIndex = 0;
  return text
    .replace(INTERIEUR_PVC_RE, " ")
    .replace(COUPE_FROID_RE, " ")
    .replace(REFERENCE_RE, " ")
    .replace(ACHAT_RE, " ")
    .replace(MARQUE_RE, " ");
}

const RECOUVERT_COULEUR_RE =
  /recouvert[e]?\s+alu(?:m(?:inium)?)?\s+de\s+couleur\s*:?\s*/i;

/** Une cellule qui parle de l'intérieur (sans mention extérieure) donne la
 *  couleur intérieure : elle ne doit jamais servir de couleur principale. */
function isInterieurCell(text: string): boolean {
  return /int[ée]rieur/i.test(text) && !/ext[ée]rieur/i.test(text);
}

function extractCouleur(row: Record<string, unknown>, catalogue: CouleurCatalogue): string {
  const optKeys = Object.keys(row)
    .map((k) => ({ k, n: /^opt(\d+)$/i.test(k) ? parseInt(k.replace(/^opt/i, ""), 10) : -1 }))
    .filter((o) => o.n >= 4)
    .sort((a, b) => a.n - b.n);
  const cell = (k: string) => stripNonCouleur(toStr(row[k]));
  // Cellules utilisables pour la couleur extérieure (on retire l'intérieur).
  const extKeys = optKeys.filter(({ k }) => !isInterieurCell(toStr(row[k])));

  // Texte qui suit « recouvert aluminium de couleur ... » (couleur extérieure).
  const recouvertTails: string[] = [];
  for (const { k } of extKeys) {
    const text = cell(k);
    const m = text.match(RECOUVERT_COULEUR_RE);
    if (m) recouvertTails.push(text.slice((m.index ?? 0) + m[0].length));
  }

  // 1) La liste officielle en priorité, d'abord sur la mention « de couleur ».
  for (const tail of recouvertTails) {
    const hit = matchCouleurInText(tail, catalogue);
    if (hit && hit !== "Blanc") return hit;
  }

  // 2) Couleur écrite telle quelle après « de couleur ».
  for (const tail of recouvertTails) {
    const hit = literalColorInText(tail, catalogue) || parseColorTail(tail);
    if (hit) return hit;
  }

  let blancFallback = "";
  for (const { k } of extKeys) {
    const hit = matchCouleurInText(cell(k), catalogue);
    if (!hit) continue;
    // « Blanc » sans code est trop faible : on le garde en dernier recours.
    if (hit === "Blanc") {
      blancFallback = blancFallback || hit;
      continue;
    }
    return hit;
  }

  // 3) Logique générale : couleur + code écrits dans la cellule.
  for (const { k } of extKeys) {
    const hit = literalColorInText(cell(k), catalogue);
    if (hit) return hit;
  }
  for (const { k } of extKeys) {
    const hit = contextColorInText(cell(k));
    if (hit) return hit;
  }

  // 4) Après « Développement de couleur », la couleur (et son code s'il existe)
  // est écrite dans une des cellules suivantes.
  const devIndex = extKeys.findIndex((o) =>
    /d[ée]veloppement\s+de\s+couleur/i.test(toStr(row[o.k])),
  );
  if (devIndex >= 0) {
    for (const { k } of extKeys.slice(devIndex + 1)) {
      const hit = colorAfterDevelopment(cell(k), catalogue);
      if (hit) return hit;
    }
  }
  return blancFallback;
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
  rawSettings?: unknown,
  couleurs: CouleurEntry[] = [],
): CadreAluRow[] {
  const catalogue = buildCouleurCatalogue(couleurs);
  const settings: CadreAluSettings = rawSettings
    ? normalizeCadreAluSettings(rawSettings)
    : DEFAULT_CADRE_ALU_SETTINGS;
  const prefixRe = new RegExp(
    `^(?:${settings.sequencePrefixes.map(escapeRe).join("|")})`,
    "i",
  );
  const reader = new MDBReader(Buffer.from(fileBuffer));
  const table = findTable(reader);
  if (!table) throw new Error("Aucune table compatible trouvée dans le fichier Access.");

  const rows = table.getData() as Array<Record<string, unknown>>;
  const kept: CadreAluRow[] = [];
  const dates = new Map<CadreAluRow, string>();

  for (const r of rows) {
    const sequence = toStr(r.Sequence);
    if (settings.sequencePrefixes.length > 0 && !prefixRe.test(sequence)) continue;
    if (targetDate && !matchesDate(r.Ligne1, targetDate)) continue;

    // Only option/description fields count — never Client or other free-text columns.
    const values = Object.entries(r)
      .filter(([key]) => /^(opt\d+|description|code)$/i.test(key))
      .map(([, v]) => toStr(v))
      .filter(Boolean);
    const aluCell = findAluCell(values, settings.aluKeywords);
    if (!aluCell) continue;
    if (isExcluded(values, settings.excludeKeywords)) continue;

    const allRowValues = Object.values(r).map(toStr).filter(Boolean);
    const dims = parseDimension(toStr(r.Dimension));
    const epaisseurs = extractEpaisseurs(values);
    const epaisseurJambage = epaisseurs[0] || "";
    const allRowValuesForImposte = Object.values(r).map(toStr).filter(Boolean);
    const imposte = extractImposte(allRowValuesForImposte);
    const hauteurJambage = imposte || extractPleineHauteur(values, dims.hauteur);
    const sens = extractSens(values);

    const couleur = extractCouleur(r, catalogue);
    const row: CadreAluRow = {
      sequence,
      id: extractId(toStr(r.Code)),
      sens,
      tete: extractTete(toStr(r.Dimension)),
      jambageLargeur: extractJambageLargeur(aluCell, values),
      jambageEpaisseur: epaisseurJambage,
      jambageHauteur: hauteurJambage,
      astragale: buildAstragaleDimMab(values, allRowValues, epaisseurJambage, sens, couleur, catalogue),
      moustiquaire: extractMoustiquaire(allRowValues),
      seuil: extractSeuil(allRowValues),
      souffle: extractSouffle(allRowValues),
      dummy: extractDummy(allRowValues),
      enfigure: extractEnfigure(allRowValues),
      couleur,
    };
    kept.push(row);
    dates.set(row, toStr(r.Ligne1));
  }

  const sortKey = settings.sortColumn ?? "sequence";
  const dir = settings.sortDir === "desc" ? -1 : 1;
  kept.sort((a, b) => {
    if (settings.sortByDate) {
      const d = (dates.get(a) ?? "").localeCompare(dates.get(b) ?? "");
      if (d !== 0) return d;
    }
    const av = String(a[sortKey] ?? "");
    const bv = String(b[sortKey] ?? "");
    const empty = (v: string) => (v.trim() ? 0 : 1);
    if (empty(av) !== empty(bv)) return empty(av) - empty(bv);
    const c = av.localeCompare(bv, "fr", { numeric: true, sensitivity: "base" });
    if (c !== 0) return c * dir;
    return a.sequence.localeCompare(b.sequence, "fr", { numeric: true });
  });
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
  rawSettings?: unknown,
): Promise<Uint8Array> {
  const settings: CadreAluSettings = rawSettings
    ? normalizeCadreAluSettings(rawSettings)
    : DEFAULT_CADRE_ALU_SETTINGS;
  const cols = settings.columns.filter((c) => c.visible);
  const totalWeight = cols.reduce((t, c) => t + c.width, 0) || 1;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Landscape for the wider table.
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 28;
  const usableWidth = pageWidth - margin * 2;

  const headers = cols.map((c) => c.label);
  const ratios = cols.map((c) => c.width / totalWeight);

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

  page.drawText(settings.pdfTitle, { x: margin, y: y - 14, size: 14, font: bold, color: rgb(0, 0, 0) });
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
    const cells = cols.map((c) => r[c.key] ?? "");
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
