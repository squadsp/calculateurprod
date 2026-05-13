import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { processPdf } from "@/lib/pdfProcessor";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/columns";
import { FileUp, Loader2, Settings as SettingsIcon, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

async function loadSettings(): Promise<Settings> {
  const { data } = await supabase.from("formula_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    trappe_components: (data.trappe_components as Settings["trappe_components"]) ?? DEFAULT_SETTINGS.trappe_components,
    mab_components: (data.mab_components as Settings["mab_components"]) ?? DEFAULT_SETTINGS.mab_components,
  };
}

function Index() {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; days: number; edits: number } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Veuillez déposer un fichier PDF.");
      return;
    }
    setBusy(true);
    try {
      const settings = await loadSettings();
      const buf = await file.arrayBuffer();
      const { bytes, daysFound, edits } = await processPdf(buf, settings);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = file.name.replace(/\.pdf$/i, "");
      a.download = `${baseName} - modifié.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setResult({ name: file.name, days: daysFound, edits });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erreur lors du traitement du PDF");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Calculateur De Production</h1>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <SettingsIcon className="h-4 w-4" />
            Paramètres
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold tracking-tight">Calculateur Battant et Hybride</h2>
          <p className="mt-2 text-muted-foreground">
            Déposez un PDF de planification : les colonnes seront recalculées automatiquement et un PDF modifié sera téléchargé.
          </p>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={`block rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/60"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center gap-3">
            {busy ? (
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            ) : (
              <FileUp className="h-12 w-12 text-primary" />
            )}
            <div className="text-base font-medium">
              {busy ? "Traitement en cours…" : "Glissez un PDF ici ou cliquez pour choisir"}
            </div>
            <div className="text-xs text-muted-foreground">PDF Mec-Inov / planification usine</div>
          </div>
        </label>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {result && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
            <div>
              <div className="font-medium text-foreground">{result.name} traité</div>
              <div className="text-muted-foreground">
                {result.days} ligne(s) jour détectée(s) · {result.edits} valeur(s) recalculée(s) · téléchargé.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
