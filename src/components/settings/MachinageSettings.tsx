import { useEffect, useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import { getCalculatorName, setCalculatorName, getDefaultCalculatorName } from "@/lib/calculatorNames";

export function MachinageSettings() {
  const [name, setName] = useState<string>(getDefaultCalculatorName("machinage"));
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(getCalculatorName("machinage"));
  }, []);

  const save = () => {
    setCalculatorName("machinage", name);
    setMsg("Nom enregistré");
    setTimeout(() => setMsg(null), 2000);
  };
  const reset = () => {
    setName(getDefaultCalculatorName("machinage"));
    setCalculatorName("machinage", "");
    setMsg("Nom réinitialisé");
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Machinage</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Extraction des lignes « Trous 3 1/4 » depuis un fichier Access (.mdb) pour une date donnée.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <label className="block text-base font-semibold mb-1">Nom du calculateur</label>
        <p className="text-xs text-muted-foreground mb-3">
          Ce nom apparaît sur la page d'accueil des portes et l'en-tête de l'extracteur.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={getDefaultCalculatorName("machinage")}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3 pt-4">
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
    </div>
  );
}
