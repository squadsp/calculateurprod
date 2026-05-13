import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { processPdf } from "@/lib/pdfProcessor";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/columns";
import { FileUp, Loader2, Settings as SettingsIcon, AlertCircle, Download, X } from "lucide-react";

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

type ProcessedPdf = {
  id: string;
  name: string;
  url: string;
  days: number;
  edits: number;
  bytes: Uint8Array;
};

function Index() {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessedPdf[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      results.forEach((r) => URL.revokeObjectURL(r.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    setError(null);
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      setError("Veuillez déposer au moins un fichier PDF.");
      return;
    }
    setBusy(true);
    try {
      const settings = await loadSettings();
      const newResults: ProcessedPdf[] = [];
      for (const file of pdfs) {
        const buf = await file.arrayBuffer();
        const { bytes, daysFound, edits } = await processPdf(buf, settings);
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        newResults.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          url,
          days: daysFound,
          edits,
          bytes,
        });
      }
      setResults((prev) => [...prev, ...newResults]);
      setActiveId(newResults[0]?.id ?? null);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erreur lors du traitement du PDF");
    } finally {
      setBusy(false);
    }
  }, []);

  const downloadOne = (r: ProcessedPdf) => {
    const a = document.createElement("a");
    a.href = r.url;
    a.download = `${r.name.replace(/\.pdf$/i, "")} - modifié.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const removeOne = (id: string) => {
    setResults((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const next = prev.filter((r) => r.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  const active = results.find((r) => r.id === activeId) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
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

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Calculateur Battant et Hybride</h2>
          <p className="mt-2 text-muted-foreground">
            Déposez un ou plusieurs PDF de planification : prévisualisez le résultat avant de télécharger.
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
            const files = Array.from(e.dataTransfer.files ?? []);
            if (files.length) handleFiles(files);
          }}
          className={`block rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/60"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) handleFiles(files);
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center gap-2">
            {busy ? (
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            ) : (
              <FileUp className="h-10 w-10 text-primary" />
            )}
            <div className="text-base font-medium">
              {busy ? "Traitement en cours…" : "Glissez un ou plusieurs PDF ici ou cliquez pour choisir"}
            </div>
            <div className="text-xs text-muted-foreground">Plusieurs fichiers acceptés</div>
          </div>
        </label>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            <aside className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground px-1">
                {results.length} fichier(s)
              </div>
              {results.map((r) => (
                <div
                  key={r.id}
                  className={`group rounded-lg border p-3 cursor-pointer transition-colors ${
                    activeId === r.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setActiveId(r.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.days} jour(s) · {r.edits} édit(s)
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeOne(r.id);
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Retirer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadOne(r);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Télécharger
                  </button>
                </div>
              ))}
            </aside>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {active ? (
                <div className="flex flex-col h-[80vh]">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2">
                    <div className="text-sm font-medium truncate">{active.name}</div>
                    <button
                      onClick={() => downloadOne(active)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-foreground bg-primary px-3 py-1.5 rounded-md hover:opacity-90"
                    >
                      <Download className="h-4 w-4" />
                      Télécharger
                    </button>
                  </div>
                  <iframe
                    key={active.id}
                    src={active.url}
                    title={active.name}
                    className="flex-1 w-full bg-muted"
                  />
                </div>
              ) : (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Sélectionnez un fichier pour le prévisualiser
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
