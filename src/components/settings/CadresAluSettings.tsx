import { useEffect, useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import { KeywordList } from "@/components/KeywordList";
import {
  DEFAULT_CADRE_ALU_SETTINGS,
  loadCadreAluSettings,
  saveCadreAluSettings,
  resetCadreAluSettings,
  type CadreAluSettings as CadreAluSettingsType,
} from "@/lib/cadresAluSettings";

export function CadresAluSettings() {
  const [s, setS] = useState<CadreAluSettingsType>(DEFAULT_CADRE_ALU_SETTINGS);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setS(loadCadreAluSettings());
  }, []);

  const save = () => {
    saveCadreAluSettings(s);
    setMsg("Paramètres enregistrés");
    setTimeout(() => setMsg(null), 2000);
  };
  const reset = () => {
    resetCadreAluSettings();
    setS(DEFAULT_CADRE_ALU_SETTINGS);
    setMsg("Valeurs par défaut restaurées");
    setTimeout(() => setMsg(null), 2000);
  };

  const setCol = (key: string, patch: Partial<CadreAluSettingsType["columns"][number]>) =>
    setS((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Cadres Aluminium</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Extraction des cadres en aluminium depuis un fichier Access (.mdb) : filtres, colonnes et mise en page du PDF.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <label className="block text-base font-semibold mb-1">Nom de l'outil</label>
          <input
            value={s.name}
            onChange={(e) => setS({ ...s, name: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-base font-semibold mb-1">Titre du PDF</label>
          <input
            value={s.pdfTitle}
            onChange={(e) => setS({ ...s, pdfTitle: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.sortByDate}
            onChange={(e) => setS({ ...s, sortByDate: e.target.checked })}
          />
          Trier par date puis séquence (sinon par séquence seulement)
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={s.flagVerifierManuellement}
            onChange={(e) => setS({ ...s, flagVerifierManuellement: e.target.checked })}
          />
          <span>
            Signaler en rouge « À VÉRIFIER MANUELLEMENT ! » les lignes contenant « Voir commande
            info suppl »
            <span className="block text-xs text-muted-foreground">
              Les colonnes à partir d'Astragale sont vidées pour laisser place au message.
              Décochez pour désactiver ce traitement.
            </span>
          </span>
        </label>
      </div>

      <KeywordList
        title="Préfixes de séquence conservés"
        description="Seules les lignes dont la séquence commence par un de ces préfixes sont gardées (ex. LA, LB, SA, PA)."
        tone="primary"
        items={s.sequencePrefixes}
        onChange={(v) => setS({ ...s, sequencePrefixes: v })}
      />

      <KeywordList
        title="Mots-clés aluminium"
        description="La ligne doit contenir un de ces mots (dans une colonne Opt, Description ou Code) pour être gardée."
        tone="success"
        items={s.aluKeywords}
        onChange={(v) => setS({ ...s, aluKeywords: v })}
      />

      <KeywordList
        title="Mots-clés d'exclusion"
        description="Toute ligne aluminium contenant un de ces mots est ignorée (ex. MAB)."
        tone="destructive"
        items={s.excludeKeywords}
        onChange={(v) => setS({ ...s, excludeKeywords: v })}
      />

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3">
          <div className="text-base font-semibold">Colonnes du rapport</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Affichez ou masquez chaque colonne, renommez son titre et ajustez sa largeur relative dans le PDF.
          </div>
        </div>
        <div className="space-y-2">
          {s.columns.map((c) => (
            <div key={c.key} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={c.visible}
                onChange={(e) => setCol(c.key, { visible: e.target.checked })}
                aria-label={`Afficher ${c.label}`}
              />
              <input
                value={c.label}
                onChange={(e) => setCol(c.key, { label: e.target.value })}
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
              <input
                type="number"
                min={1}
                step={0.5}
                value={c.width}
                onChange={(e) => setCol(c.key, { width: Number(e.target.value) || 1 })}
                className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                aria-label={`Largeur ${c.label}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <button
          onClick={save}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Save className="h-4 w-4" /> Enregistrer
        </button>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <RotateCcw className="h-4 w-4" /> Réinitialiser
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
