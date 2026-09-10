import type { CadreAluRow } from "@/lib/cadresAlu.types";

export type CadreAluColumnKey = Exclude<keyof CadreAluRow, "aVerifier">;

export type CadreAluColumn = {
  key: CadreAluColumnKey;
  label: string;
  visible: boolean;
  width: number; // poids relatif de la colonne dans le PDF
};

export type CadreAluSettings = {
  name: string;
  pdfTitle: string;
  sequencePrefixes: string[];
  aluKeywords: string[];
  excludeKeywords: string[];
  sortByDate: boolean;
  /** Marquer en rouge les lignes « Voir commande info suppl ». */
  flagVerifierManuellement: boolean;
  sortColumn?: CadreAluColumnKey;
  sortDir?: "asc" | "desc";
  columns: CadreAluColumn[];
};

export const DEFAULT_CADRE_ALU_SETTINGS: CadreAluSettings = {
  name: "Cadres Aluminium",
  pdfTitle: "Cadres Aluminium",
  sequencePrefixes: ["LA", "LB", "SA", "PA"],
  aluKeywords: ["alu", "alum", "aluminium", "aluminum"],
  excludeKeywords: ["MAB"],
  sortByDate: false,
  columns: [
    { key: "sequence", label: "SA-PA", visible: true, width: 5 },
    { key: "id", label: "ID", visible: true, width: 7 },
    { key: "sens", label: "SENS", visible: true, width: 4 },
    { key: "tete", label: "MESURE TÊTE", visible: true, width: 7 },
    { key: "jambageLargeur", label: "LARGEUR JAMBAGE", visible: true, width: 7 },
    { key: "jambageEpaisseur", label: "ÉPAISSEUR JAMBAGE", visible: true, width: 7 },
    { key: "jambageHauteur", label: "HAUTEUR JAMBAGE", visible: true, width: 6.5 },
    { key: "astragale", label: "ASTRAGALE DIM M.A.B INT", visible: true, width: 15.5 },
    { key: "moustiquaire", label: "MST", visible: true, width: 3 },
    { key: "seuil", label: "SEUIL", visible: true, width: 8.5 },
    { key: "souffle", label: "SOUFFLÉ", visible: true, width: 6 },
    { key: "dummy", label: "DUMMY", visible: true, width: 6 },
    { key: "enfigure", label: "ENFIGURÉ", visible: true, width: 10.5 },
    { key: "couleur", label: "COULEUR", visible: true, width: 7 },
  ],
};

const STORAGE_KEY = "cadres_alu_settings";

export function normalizeCadreAluSettings(raw: unknown): CadreAluSettings {
  const d = DEFAULT_CADRE_ALU_SETTINGS;
  if (!raw || typeof raw !== "object") return d;
  const p = raw as Partial<CadreAluSettings>;
  const cols = Array.isArray(p.columns) ? p.columns : [];
  const columns = d.columns.map((def) => {
    const found = cols.find((c) => c && c.key === def.key);
    return found
      ? {
          key: def.key,
          label: typeof found.label === "string" && found.label.trim() ? found.label : def.label,
          visible: found.visible !== false,
          width: typeof found.width === "number" && found.width > 0 ? found.width : def.width,
        }
      : def;
  });
  const strList = (v: unknown, fb: string[]) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : fb;
  return {
    name: typeof p.name === "string" && p.name.trim() ? p.name : d.name,
    pdfTitle: typeof p.pdfTitle === "string" && p.pdfTitle.trim() ? p.pdfTitle : d.pdfTitle,
    sequencePrefixes: strList(p.sequencePrefixes, d.sequencePrefixes),
    aluKeywords: strList(p.aluKeywords, d.aluKeywords),
    excludeKeywords: strList(p.excludeKeywords, d.excludeKeywords),
    sortByDate: p.sortByDate === true,
    sortColumn: d.columns.some((c) => c.key === p.sortColumn) ? p.sortColumn : "sequence",
    sortDir: p.sortDir === "desc" ? "desc" : "asc",
    columns,
  };
}

export function loadCadreAluSettings(): CadreAluSettings {
  if (typeof window === "undefined") return DEFAULT_CADRE_ALU_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CADRE_ALU_SETTINGS;
    return normalizeCadreAluSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_CADRE_ALU_SETTINGS;
  }
}

export function saveCadreAluSettings(s: CadreAluSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function resetCadreAluSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
