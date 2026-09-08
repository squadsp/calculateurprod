import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  FileUp,
  Loader2,
  AlertCircle,
  Download,
  Printer,
  X,
  CalendarIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { processCadreAluSources, type CadreAluRow } from "@/lib/cadresAlu.functions";

export const Route = createFileRoute("/portes-cadres-alu")({
  component: CadresAluPage,
  head: () => ({
    meta: [
      { title: "Cadres Aluminium — Extraction Portes" },
      {
        name: "description",
        content:
          "Extrayez les commandes de cadres en aluminium d'un fichier Access et générez une liste imprimable.",
      },
      { property: "og:title", content: "Cadres Aluminium — Extraction Portes" },
      {
        property: "og:description",
        content:
          "Extrayez les commandes de cadres en aluminium d'un fichier Access et générez une liste imprimable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Result = {
  id: string;
  name: string;
  url: string;
  count: number;
  rows: CadreAluRow[];
};

type Source = { id: string; name: string; base64: string };

function todayIso() {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function CadresAluPage() {
  const processSources = useServerFn(processCadreAluSources);

  const [date, setDate] = useState<string>(todayIso());
  const [useDate, setUseDate] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [sources, setSources] = useState<Source[]>([]);

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
        base64: arrayBufferToBase64(await file.arrayBuffer()),
      });
    }
    setSources((prev) => [...prev, ...newSources]);
  }, []);

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
        const response = await processSources({
          data: { sources, date: useDate ? date : null },
        });
        const out = response.results.map((result): Result => {
          const bytes = base64ToUint8Array(result.pdfBase64);
          const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
          return {
            id: result.id,
            name: result.name,
            url: URL.createObjectURL(blob),
            count: result.count,
            rows: result.rows,
          };
        });
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
    return () => {
      cancelled = true;
    };
  }, [sources, date, useDate, processSources]);

  const downloadOne = (r: Result) => {
    const a = document.createElement("a");
    a.href = r.url;
    a.download = `Cadres Aluminium${useDate ? ` ${date}` : ""}.pdf`;
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/portes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Portes
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Cadres Aluminium</h1>
          <Link to="/portes-admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <SettingsIcon className="h-4 w-4" /> Paramètres
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Cadres Aluminium</h2>
          <p className="mt-2 text-muted-foreground">
            Déposez un fichier Access (.mdb) pour extraire les commandes en aluminium.
          </p>
        </div>

        <div className="grid md:grid-cols-[1fr_260px] gap-6 items-start">
          <div
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
                {busy ? (
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                ) : (
                  <FileUp className="h-10 w-10 text-primary" />
                )}
                <div className="text-base font-medium">
                  {busy ? "Traitement en cours…" : "Glissez un fichier .mdb ici ou cliquez pour choisir"}
                </div>
                <div className="text-xs text-muted-foreground">Un ou plusieurs fichiers Access acceptés</div>
              </div>
            </label>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <label className="text-sm font-semibold flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" /> Filtrer par date
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useDate} onChange={(e) => setUseDate(e.target.checked)} />
              Utiliser une date précise
            </label>
            <input
              type="date"
              value={date}
              disabled={!useDate}
              onChange={(e) => setDate(e.target.value)}
              className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {results.map((r) => (
          <div key={r.id} className="mt-8">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.count} ligne(s) extraite(s)</div>
              </div>
              <button
                onClick={() => downloadOne(r)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-foreground bg-primary px-3 py-1.5 rounded-md hover:opacity-90"
              >
                <Download className="h-4 w-4" /> Télécharger
              </button>
              <button
                onClick={() => printOne(r.url)}
                className="inline-flex items-center gap-1.5 text-sm font-medium border border-border px-3 py-1.5 rounded-md hover:bg-muted"
              >
                <Printer className="h-4 w-4" /> Imprimer
              </button>
              <button
                onClick={() => setSources((prev) => prev.filter((s) => s.id !== r.id))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Retirer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {r.rows.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {[
                        "SA-PA",
                        "ID",
                        "Sens",
                        "Mesure tête",
                        "Largeur jambage",
                        "Épaisseur jambage",
                        "Hauteur jambage",
                        "Astragale dim m.a.b int",
                        "Moust.",
                        "Seuil",
                        "Soufflé",
                        "Couleur",
                      ].map((h) => (
                        <th key={h} className="px-2 py-2 text-left font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      ))}

                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={`${row.id}-${row.sequence}-${i}`} className="border-t border-border">
                        <td className="px-3 py-1.5">{row.sequence}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{row.id}</td>
                        <td className="px-3 py-1.5">{row.sens}</td>
                        <td className="px-3 py-1.5">{row.tete}</td>
                        <td className="px-3 py-1.5">{row.jambageLargeur}</td>
                        <td className="px-3 py-1.5">{row.jambageEpaisseur}</td>
                        <td className="px-3 py-1.5">{row.jambageHauteur}</td>
                        <td className="px-3 py-1.5">{row.astragale}</td>
                        <td className="px-3 py-1.5">{row.moustiquaire}</td>
                        <td className="px-3 py-1.5">{row.seuil}</td>
                        <td className="px-3 py-1.5">{row.couleur}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
