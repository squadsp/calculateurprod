import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Settings as SettingsIcon, FileUp, Loader2, AlertCircle, Download, Printer, X, CalendarIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCalculatorName } from "@/lib/calculatorNames";
import { extractMachinageRows, buildMachinagePdf, type MachinageRow } from "@/lib/machinageProcessor";

export const Route = createFileRoute("/portes-machinage")({
  component: PortesMachinagePage,
});

type Result = {
  id: string;
  name: string;
  url: string;
  count: number;
  bytes: Uint8Array;
  rows: MachinageRow[];
};

type Source = { id: string; name: string; buffer: ArrayBuffer };

function todayIso() {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function PortesMachinagePage() {
  const [name, setName] = useState("Machinage");
  useEffect(() => { setName(getCalculatorName("machinage")); }, []);

  const [date, setDate] = useState<string>(todayIso());
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => () => { results.forEach((r) => URL.revokeObjectURL(r.url)); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const targetDate = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }, [date]);

  const handleFiles = useCallback(async (files: File[]) => {
    setError(null);
    const mdbs = files.filter((f) => /\.(mdb|accdb)$/i.test(f.name));
    if (mdbs.length === 0) {
      setError("Veuillez déposer un fichier .mdb ou .accdb.");
      return;
    }
    const newSources: Source[] = [];
    for (const file of mdbs) {
      newSources.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        buffer: await file.arrayBuffer(),
      });
    }
    setSources((prev) => [...prev, ...newSources]);
  }, []);

  // Reprocess all uploaded sources whenever the date (or the list of sources) changes.
  useEffect(() => {
    let cancelled = false;
    if (sources.length === 0) {
      setResults((prev) => {
        prev.forEach((r) => URL.revokeObjectURL(r.url));
        return [];
      });
      return;
    }
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const out: Result[] = [];
        for (const s of sources) {
          const rows = extractMachinageRows(s.buffer, targetDate);
          const bytes = await buildMachinagePdf(rows, targetDate);
          const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
          out.push({
            id: s.id,
            name: s.name,
            url: URL.createObjectURL(blob),
            count: rows.length,
            bytes,
            rows,
          });
        }
        if (cancelled) {
          out.forEach((r) => URL.revokeObjectURL(r.url));
          return;
        }
        setResults((prev) => {
          prev.forEach((r) => URL.revokeObjectURL(r.url));
          return out;
        });
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setError(e instanceof Error ? e.message : "Erreur lors du traitement du fichier");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sources, targetDate]);

  const downloadOne = (r: Result) => {
    const a = document.createElement("a");
    a.href = r.url;
    a.download = `Machinage ${date}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const printOne = (url: string) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
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
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/portes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Portes
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
          <Link to="/portes-admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <SettingsIcon className="h-4 w-4" /> Paramètres
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Extracteur — {name}</h2>
          <p className="mt-2 text-muted-foreground">
            Déposez un fichier Access (.mdb) et choisissez une date pour extraire les lignes « Trous 3 1/4 ».
          </p>
        </div>

        <div className="grid md:grid-cols-[1fr_260px] gap-6 items-start">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files ?? []);
              if (files.length) handleFiles(files);
            }}
            className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border bg-card"
            } ${busy ? "opacity-60" : ""}`}
          >
            <label className="block cursor-pointer">
              <input
                type="file"
                accept=".mdb,.accdb,application/x-msaccess"
                multiple
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) handleFiles(files);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-col items-center gap-2">
                {busy ? <Loader2 className="h-10 w-10 text-primary animate-spin" /> : <FileUp className="h-10 w-10 text-primary" />}
                <div className="text-base font-medium">
                  {busy ? "Traitement en cours…" : "Glissez un fichier .mdb ici ou cliquez pour choisir"}
                </div>
                <div className="text-xs text-muted-foreground">Un ou plusieurs fichiers Access acceptés</div>
              </div>
            </label>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <label className="text-sm font-semibold flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" />
              Date à extraire
            </label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Seules les lignes dont la colonne Ligne1 correspond à cette date sont conservées.
            </p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-8 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground px-1">
              {results.length} fichier(s) prêt(s)
            </div>
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.count} ligne(s) extraite(s)
                  </div>
                </div>
                <button onClick={() => downloadOne(r)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-foreground bg-primary px-3 py-1.5 rounded-md hover:opacity-90">
                  <Download className="h-4 w-4" /> Télécharger
                </button>
                <button onClick={() => printOne(r.url)} className="inline-flex items-center gap-1.5 text-sm font-medium border border-border px-3 py-1.5 rounded-md hover:bg-muted">
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
                <button onClick={() => removeOne(r.id)} className="text-muted-foreground hover:text-destructive" aria-label="Retirer">
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