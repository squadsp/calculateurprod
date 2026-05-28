import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { processPdf } from "@/lib/pdfProcessor";
import { PDFDocument } from "pdf-lib";
import {
  DEFAULT_SETTINGS,
  DEFAULT_THRESHOLDS,
  DEFAULT_THRESHOLD_LABELS,
  type Settings,
  type Thresholds,
  type ThresholdLabels,
} from "@/lib/columns";
import { FileUp, Loader2, Settings as SettingsIcon, AlertCircle, Download, X, Printer, CalendarClock, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/fenetres")({
  component: Index,
});

async function loadSettings(): Promise<Settings> {
  const { data } = await supabase.from("formula_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    trappe_components: (data.trappe_components as Settings["trappe_components"]) ?? DEFAULT_SETTINGS.trappe_components,
    mab_components: (data.mab_components as Settings["mab_components"]) ?? DEFAULT_SETTINGS.mab_components,
    vf_components:
      (data.vf_components as unknown as Settings["vf_components"]) ??
      DEFAULT_SETTINGS.vf_components,
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...((data as { thresholds?: Partial<Thresholds> }).thresholds ?? {}),
    },
    threshold_labels: {
      ...DEFAULT_THRESHOLD_LABELS,
      ...((data as { threshold_labels?: Partial<ThresholdLabels> }).threshold_labels ?? {}),
    },
  };
}

type ProcessedPdf = {
  id: string;
  name: string;
  url: string;
  days: number;
  edits: number;
  bytes: Uint8Array;
  original: ArrayBuffer;
};

function Index() {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessedPdf[]>([]);
  const [highlightsEnabled, setHighlightsEnabled] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsAdmin(sessionStorage.getItem("trappemab_admin") === "1");
    }
  }, []);

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
        const { bytes, daysFound, edits } = await processPdf(buf, settings, {
          highlights: highlightsEnabled,
        });
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        newResults.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          url,
          days: daysFound,
          edits,
          bytes,
          original: buf,
        });
      }
      setResults((prev) => [...prev, ...newResults]);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erreur lors du traitement du PDF");
    } finally {
      setBusy(false);
    }
  }, [highlightsEnabled]);

  const toggleHighlights = useCallback(async (next: boolean) => {
    setHighlightsEnabled(next);
    setResults((prev) => prev);
    const current = results;
    if (current.length === 0) return;
    setBusy(true);
    try {
      const settings = await loadSettings();
      const reprocessed: ProcessedPdf[] = [];
      for (const r of current) {
        const { bytes, daysFound, edits } = await processPdf(r.original, settings, {
          highlights: next,
        });
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        URL.revokeObjectURL(r.url);
        reprocessed.push({ ...r, bytes, days: daysFound, edits, url });
      }
      setResults(reprocessed);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erreur lors du retraitement");
    } finally {
      setBusy(false);
    }
  }, [results]);

  const downloadOne = (r: ProcessedPdf) => {
    const a = document.createElement("a");
    a.href = r.url;
    a.download = `${r.name.replace(/\.pdf$/i, "")} - modifié.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const printOne = (r: ProcessedPdf) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = r.url;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.open(r.url, "_blank");
      }
    };
    document.body.appendChild(iframe);
  };

  const printAll = async () => {
    if (results.length === 0) return;
    const sorted = [...results].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );
    const merged = await PDFDocument.create();
    for (const r of sorted) {
      const src = await PDFDocument.load(r.bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    const out = await merged.save();
    const blob = new Blob([out as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.open(url, "_blank");
      }
    };
    document.body.appendChild(iframe);
  };

  const removeOne = (id: string) => {
    setResults((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((r) => r.id !== id);
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Accueil
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Fenêtres</h1>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Link
                to="/delays"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <CalendarClock className="h-4 w-4" />
                Délais
              </Link>
            )}
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <SettingsIcon className="h-4 w-4" />
              Paramètres
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight">calculateur de production</h2>
          <p className="mt-2 text-muted-foreground">
            Déposez un ou plusieurs PDF de planification : prévisualisez le résultat avant de télécharger.
          </p>
        </div>

        <div className="mb-4 flex items-center justify-end gap-2 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <span className="text-muted-foreground">Surlignage</span>
            <button
              type="button"
              role="switch"
              aria-checked={highlightsEnabled}
              onClick={() => toggleHighlights(!highlightsEnabled)}
              disabled={busy}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                highlightsEnabled ? "bg-primary" : "bg-muted"
              } ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  highlightsEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>
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
          <div className="mt-8 space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {results.length} fichier(s) prêt(s)
              </div>
              <button
                onClick={printAll}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-foreground bg-primary px-3 py-1.5 rounded-md hover:opacity-90"
              >
                <Printer className="h-4 w-4" />
                Imprimer tout
              </button>
            </div>
            {results.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.days} jour(s) · {r.edits} édit(s)
                  </div>
                </div>
                <button
                  onClick={() => downloadOne(r)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-foreground bg-primary px-3 py-1.5 rounded-md hover:opacity-90"
                >
                  <Download className="h-4 w-4" />
                  Télécharger
                </button>
                <button
                  onClick={() => printOne(r)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium border border-border px-3 py-1.5 rounded-md hover:bg-muted"
                >
                  <Printer className="h-4 w-4" />
                  Imprimer
                </button>
                <button
                  onClick={() => removeOne(r.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Retirer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
