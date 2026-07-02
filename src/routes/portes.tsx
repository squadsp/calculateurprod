import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { ArrowLeft, Settings as SettingsIcon, FileUp, Loader2, AlertCircle, Download, X, Printer } from "lucide-react";
import { processPortesPdf, DEFAULT_PORTES_KEYWORDS, type PortesKeywords } from "@/lib/portesProcessor";

const EMPTY_KEYWORDS: PortesKeywords = { laminate: [], reject: [], keep: [] };

export const Route = createFileRoute("/portes")({
  component: PortesPage,
});

type ProcessedPdf = {
  id: string;
  name: string;
  url: string;
  kept: number;
  sum: number;
  bytes: Uint8Array;
  original: ArrayBuffer;
};

function loadKeywords(storageKey: string, fallback: PortesKeywords): PortesKeywords {
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

function PortesPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Accueil
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Portes &amp; Peinture</h1>
          <Link
            to="/portes-admin"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <SettingsIcon className="h-4 w-4" />
            Paramètres
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-14">
        <CalculatorSection
          title="Calculateur de portes"
          subtitle="Déposez un ou plusieurs PDF de jambages"
          storageKey="portes_keywords"
          defaultKeywords={DEFAULT_PORTES_KEYWORDS}
          categorize
        />
        <div className="border-t border-border" />
        <CalculatorSection
          title="Calculateur de peinture"
          subtitle="Déposez un ou plusieurs PDF"
          storageKey="peinture_keywords"
          defaultKeywords={EMPTY_KEYWORDS}
          categorize={false}
        />
      </main>
    </div>
  );
}

function CalculatorSection({
  title,
  subtitle,
  storageKey,
  defaultKeywords,
  categorize,
}: {
  title: string;
  subtitle: string;
  storageKey: string;
  defaultKeywords: PortesKeywords;
  categorize: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessedPdf[]>([]);
  const [highlightsEnabled, setHighlightsEnabled] = useState(true);

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
      const kw = loadKeywords(storageKey, defaultKeywords);
      const newResults: ProcessedPdf[] = [];
      for (const file of pdfs) {
        const buf = await file.arrayBuffer();
        const { bytes, kept, sum } = await processPortesPdf(buf, kw, { highlights: highlightsEnabled, categorize });
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        newResults.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          url,
          kept,
          sum,
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
  }, [highlightsEnabled, storageKey, defaultKeywords, categorize]);

  const toggleHighlights = useCallback(async (next: boolean) => {
    setHighlightsEnabled(next);
    if (results.length === 0) return;
    setBusy(true);
    try {
      const kw = loadKeywords(storageKey, defaultKeywords);
      const reprocessed: ProcessedPdf[] = [];
      for (const r of results) {
        const { bytes, kept, sum } = await processPortesPdf(r.original, kw, { highlights: next, categorize });
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        URL.revokeObjectURL(r.url);
        reprocessed.push({ ...r, bytes, kept, sum, url });
      }
      setResults(reprocessed);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erreur lors du retraitement");
    } finally {
      setBusy(false);
    }
  }, [results, storageKey, defaultKeywords, categorize]);

  const downloadOne = (r: ProcessedPdf) => {
    const a = document.createElement("a");
    a.href = r.url;
    a.download = `${r.name.replace(/\.pdf$/i, "")} - modifié.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const printViaIframe = (url: string) => {
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
    printViaIframe(URL.createObjectURL(blob));
  };

  const removeOne = (id: string) => {
    setResults((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((r) => r.id !== id);
    });
  };

  return (
    <section>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
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
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
            {busy ? <Loader2 className="h-10 w-10 text-primary animate-spin" /> : <FileUp className="h-10 w-10 text-primary" />}
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
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.kept} ligne(s) conservée(s) · total = {r.sum}
                  </div>
                </div>
                <button onClick={() => downloadOne(r)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-foreground bg-primary px-3 py-1.5 rounded-md hover:opacity-90">
                  <Download className="h-4 w-4" /> Télécharger
                </button>
                <button onClick={() => printViaIframe(r.url)} className="inline-flex items-center gap-1.5 text-sm font-medium border border-border px-3 py-1.5 rounded-md hover:bg-muted">
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
                <button onClick={() => removeOne(r.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Retirer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}
