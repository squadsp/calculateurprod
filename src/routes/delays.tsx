import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_SETTINGS,
  DEFAULT_THRESHOLDS,
  DEFAULT_THRESHOLD_LABELS,
  type Settings,
  type Thresholds,
  type ThresholdLabels,
} from "@/lib/columns";
import { calculateDelays, type LineKey } from "@/lib/delayCalculator";
import { saveDelays } from "@/lib/delays.functions";
import { ArrowLeft, FileUp, Loader2, AlertCircle, X, Calendar } from "lucide-react";

export const Route = createFileRoute("/delays")({
  component: DelaysPage,
});

async function loadSettings(): Promise<Settings> {
  const { data } = await supabase.from("formula_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    trappe_components: (data.trappe_components as Settings["trappe_components"]) ?? DEFAULT_SETTINGS.trappe_components,
    mab_components: (data.mab_components as Settings["mab_components"]) ?? DEFAULT_SETTINGS.mab_components,
    vf_components: (data.vf_components as unknown as Settings["vf_components"]) ?? DEFAULT_SETTINGS.vf_components,
    thresholds: { ...DEFAULT_THRESHOLDS, ...((data as { thresholds?: Partial<Thresholds> }).thresholds ?? {}) },
    threshold_labels: {
      ...DEFAULT_THRESHOLD_LABELS,
      ...((data as { threshold_labels?: Partial<ThresholdLabels> }).threshold_labels ?? {}),
    },
  };
}

type FileEntry = { id: string; name: string; buf: ArrayBuffer };

const ALL_LINES: LineKey[] = ["trappe", "mab", "coulissant_pvc", "vf", "peinture"];

function DelaysPage() {
  const save = useServerFn(saveDelays);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<LineKey, { text: string | null; dateLabel: string | null }> | null>(null);
  const [needsMore, setNeedsMore] = useState<LineKey[]>([]);
  const [labels, setLabels] = useState<ThresholdLabels>(DEFAULT_THRESHOLD_LABELS);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activeLines, setActiveLines] = useState<LineKey[]>([
    "trappe",
    "mab",
    "coulissant_pvc",
    "peinture",
  ]);

  // Load previously saved delays so they survive a refresh.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("formula_settings")
        .select("delays, threshold_labels")
        .eq("id", 1)
        .maybeSingle();
      if (!data) return;
      const tl = (data.threshold_labels as ThresholdLabels | null) ?? DEFAULT_THRESHOLD_LABELS;
      setLabels({ ...DEFAULT_THRESHOLD_LABELS, ...tl });
      const d = (data.delays ?? {}) as Record<string, string>;
      const has = ALL_LINES.some((l) => d[l]);
      if (!has) return;
      const fmt: Record<LineKey, { text: string | null; dateLabel: string | null }> = {} as never;
      for (const line of ALL_LINES) fmt[line] = { text: d[line] || null, dateLabel: null };
      setResults(fmt);
      if (d.updated_at) {
        const dt = new Date(d.updated_at);
        if (!isNaN(dt.getTime())) setSavedAt(dt.toLocaleString("fr-FR"));
      }
    })();
  }, []);

  const onPick = useCallback(async (picked: File[]) => {
    setError(null);
    const pdfs = picked.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) {
      setError("Veuillez ajouter des fichiers PDF.");
      return;
    }
    const entries: FileEntry[] = [];
    for (const f of pdfs) {
      entries.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: f.name, buf: await f.arrayBuffer() });
    }
    setFiles((prev) => [...prev, ...entries]);
    setResults(null);
    setNeedsMore([]);
    setSavedAt(null);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setResults(null);
    setNeedsMore([]);
  };

  const moveFile = (idx: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setResults(null);
  };

  const compute = async () => {
    setError(null);
    if (files.length < 2) {
      setError("Ajoutez au moins 2 fichiers PDF (du plus proche au plus lointain).");
      return;
    }
    setBusy(true);
    try {
      const settings = await loadSettings();
      setLabels(settings.threshold_labels);
      const computeVf = (settings.vf_components?.length ?? 0) > 0;
      const pvcInVf = (settings.vf_components ?? []).some((c) => c.field === "coulissant_pvc");
      const lines: LineKey[] = ALL_LINES.filter((l) => {
        if (l === "vf") return computeVf;
        if (l === "coulissant_pvc") return !pvcInVf;
        return true;
      });
      setActiveLines(lines);
      const today = new Date();
      const { results: r, needsMore: nm } = await calculateDelays(
        files.map((f) => f.buf),
        settings,
        today,
      );
      const fmt: Record<LineKey, { text: string | null; dateLabel: string | null }> = {} as never;
      for (const line of ALL_LINES) {
        const v = r[line];
        if (!v) {
          fmt[line] = { text: null, dateLabel: null };
          continue;
        }
        fmt[line] = {
          text: v.text,
          dateLabel: v.date
            ? v.date.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })
            : null,
        };
      }
      setResults(fmt);
      setNeedsMore(nm);

      // Auto-save: only persist lines that produced a delay text.
      const payload = {
        trappe: fmt.trappe.text ?? "",
        mab: fmt.mab.text ?? "",
        coulissant_pvc: fmt.coulissant_pvc.text ?? "",
        vf: fmt.vf.text ?? "",
        peinture: fmt.peinture.text ?? "",
      };
      await save({ data: payload });
      setSavedAt(new Date().toLocaleTimeString("fr-FR"));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erreur lors du calcul");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
          <h1 className="text-lg font-semibold">Calculateur de délais</h1>
          <span className="w-16" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Délais par ligne</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Déposez au minimum 2 PDF de planification dans l'ordre chronologique
            (du plus proche au plus lointain). Le délai est calculé jusqu'au prochain
            jour non plein, plafonné à un minimum de 4 semaines, avec un intervalle de 2 semaines.
          </p>
        </div>

        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const fs = Array.from(e.dataTransfer.files ?? []);
            if (fs.length) onPick(fs);
          }}
          className="block rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center cursor-pointer hover:border-primary/60"
        >
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length) onPick(fs);
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center gap-2">
            <FileUp className="h-10 w-10 text-primary" />
            <div className="text-base font-medium">Glissez vos PDF ici ou cliquez pour choisir</div>
            <div className="text-xs text-muted-foreground">L'ordre des fichiers compte (réorganisez si besoin)</div>
          </div>
        </label>

        {files.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground px-1">
              {files.length} fichier(s) — ordre chronologique
            </div>
            {files.map((f, i) => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <div className="text-xs text-muted-foreground w-6">#{i + 1}</div>
                <div className="flex-1 truncate text-sm font-medium">{f.name}</div>
                <button
                  onClick={() => moveFile(i, -1)}
                  disabled={i === 0}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveFile(i, 1)}
                  disabled={i === files.length - 1}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-30"
                >
                  ↓
                </button>
                <button onClick={() => removeFile(f.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div>
          <button
            onClick={compute}
            disabled={busy || files.length < 2}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            Calculer les délais
          </button>
          {savedAt && (
            <span className="ml-3 text-xs text-muted-foreground">Enregistré à {savedAt}</span>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {needsMore.length > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm">
            <div className="font-medium mb-1">Tous les jours fournis sont pleins pour&nbsp;:</div>
            <ul className="list-disc list-inside text-muted-foreground">
              {needsMore.map((l) => (
                <li key={l}>{labels[l]}</li>
              ))}
            </ul>
            <div className="mt-2">Ajoutez un PDF supplémentaire couvrant des semaines plus lointaines.</div>
          </div>
        )}

        {results && (
          <div className="grid sm:grid-cols-2 gap-3">
            {activeLines.map((line) => (
              <div key={line} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{labels[line]}</div>
                <div className="mt-2 text-2xl font-semibold">
                  {results[line].text ?? "—"}
                </div>
                {results[line].dateLabel && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Prochain jour disponible : {results[line].dateLabel}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}