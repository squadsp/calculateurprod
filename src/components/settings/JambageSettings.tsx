import { useEffect, useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import { KeywordList } from "@/components/KeywordList";
import { DEFAULT_PORTES_KEYWORDS, type PortesKeywords } from "@/lib/portesProcessor";
import { getCalculatorName, setCalculatorName, getDefaultCalculatorName } from "@/lib/calculatorNames";

const storageKey = "portes_keywords" as const;

function loadKeywords(fallback: PortesKeywords): PortesKeywords {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PortesKeywords>;
    return {
      laminate: parsed.laminate ?? fallback.laminate,
      reject: parsed.reject ?? fallback.reject,
      keep: parsed.keep ?? fallback.keep,
    };
  } catch {
    return fallback;
  }
}

export function JambageSettings() {
  const [kw, setKw] = useState<PortesKeywords>(DEFAULT_PORTES_KEYWORDS);
  const [name, setName] = useState<string>(getDefaultCalculatorName(storageKey));
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setKw(loadKeywords(DEFAULT_PORTES_KEYWORDS));
    setName(getCalculatorName(storageKey));
  }, []);

  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(kw));
      setCalculatorName(storageKey, name);
      setMsg("Paramètres enregistrés");
      setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg("Erreur lors de l'enregistrement");
    }
  };

  const reset = () => {
    setKw(DEFAULT_PORTES_KEYWORDS);
    setName(getDefaultCalculatorName(storageKey));
    setCalculatorName(storageKey, "");
    localStorage.removeItem(storageKey);
    setMsg("Valeurs par défaut restaurées");
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Jambage</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez quelles lignes du PDF sont conservées ou ignorées lors du calcul.
          Les correspondances sont insensibles à la casse.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <label className="block text-base font-semibold mb-1">Nom du calculateur</label>
        <p className="text-xs text-muted-foreground mb-3">
          Ce nom apparaît sur la page d'accueil des portes et l'en-tête du calculateur.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={getDefaultCalculatorName(storageKey)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <KeywordList
        title="Laminé (priorité absolue)"
        description="Toute ligne contenant un de ces mots est TOUJOURS conservée, même si elle contient un mot rejeté."
        tone="primary"
        items={kw.laminate}
        onChange={(v) => setKw((k) => ({ ...k, laminate: v }))}
      />

      <KeywordList
        title="Rejetés (liste noire)"
        description="Toute ligne contenant un de ces mots est ignorée (sauf si elle contient aussi un mot Laminé)."
        tone="destructive"
        items={kw.reject}
        onChange={(v) => setKw((k) => ({ ...k, reject: v }))}
      />

      <KeywordList
        title="Conservés (liste blanche)"
        description={`Lignes conservées par défaut. Règle spéciale : "1\" 1/4" est conservé sauf si suivi de "-<chiffre>" autre que "-7".`}
        tone="success"
        items={kw.keep}
        onChange={(v) => setKw((k) => ({ ...k, keep: v }))}
      />

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
