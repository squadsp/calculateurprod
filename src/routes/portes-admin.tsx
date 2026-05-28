import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyAdmin } from "@/lib/settings.functions";
import { DEFAULT_PORTES_KEYWORDS, type PortesKeywords } from "@/lib/portesProcessor";
import { ArrowLeft, Loader2, LogOut, Save, Plus, X, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/portes-admin")({
  component: PortesAdminPage,
});

const ADMIN_KEY = "trappemab_admin";
const STORAGE_KEY = "portes_keywords";

function loadKeywords(): PortesKeywords {
  if (typeof window === "undefined") return DEFAULT_PORTES_KEYWORDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PORTES_KEYWORDS;
    const parsed = JSON.parse(raw) as Partial<PortesKeywords>;
    return {
      laminate: parsed.laminate ?? DEFAULT_PORTES_KEYWORDS.laminate,
      reject: parsed.reject ?? DEFAULT_PORTES_KEYWORDS.reject,
      keep: parsed.keep ?? DEFAULT_PORTES_KEYWORDS.keep,
    };
  } catch {
    return DEFAULT_PORTES_KEYWORDS;
  }
}

function PortesAdminPage() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(ADMIN_KEY) === "1") {
      setAuthed(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/portes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Portes
          </Link>
          <h1 className="text-lg font-semibold">Paramètres — Portes</h1>
          {authed ? (
            <button
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                sessionStorage.removeItem(ADMIN_KEY);
                setAuthed(false);
              }}
            >
              <LogOut className="h-4 w-4" /> Déconnexion
            </button>
          ) : (
            <span className="w-16" />
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-10">
        {authed ? <PortesSettingsEditor /> : <LoginForm onSuccess={() => setAuthed(true)} />}
      </main>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const verify = useServerFn(verifyAdmin);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="max-w-sm mx-auto space-y-4 mt-12 rounded-xl border border-border bg-card p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try {
          await verify({ data: { username: u, password: p } });
          sessionStorage.setItem(ADMIN_KEY, "1");
          onSuccess();
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : "Erreur");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-lg font-semibold">Connexion administrateur</h2>
      <div>
        <label className="text-sm text-muted-foreground">Utilisateur</label>
        <input
          autoFocus
          value={u}
          onChange={(e) => setU(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm text-muted-foreground">Mot de passe</label>
        <input
          type="password"
          value={p}
          onChange={(e) => setP(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Se connecter
      </button>
    </form>
  );
}

function PortesSettingsEditor() {
  const [kw, setKw] = useState<PortesKeywords>(DEFAULT_PORTES_KEYWORDS);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setKw(loadKeywords());
  }, []);

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(kw));
      setMsg("Paramètres enregistrés");
      setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg("Erreur lors de l'enregistrement");
    }
  };

  const reset = () => {
    setKw(DEFAULT_PORTES_KEYWORDS);
    localStorage.removeItem(STORAGE_KEY);
    setMsg("Valeurs par défaut restaurées");
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Mots-clés du traitement des portes</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configurez quelles lignes du PDF sont conservées ou ignorées lors du calcul.
          Les correspondances sont insensibles à la casse.
        </p>
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

function KeywordList({
  title,
  description,
  tone,
  items,
  onChange,
}: {
  title: string;
  description: string;
  tone: "primary" | "destructive" | "success";
  items: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const chipClass =
    tone === "destructive"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : tone === "success"
        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
        : "bg-primary/10 text-primary border-primary/30";

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...items, v]);
    setDraft("");
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
        {items.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">Aucun mot-clé</span>
        ) : (
          items.map((w, i) => (
            <span
              key={`${w}-${i}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${chipClass}`}
            >
              <span className="font-mono">{w}</span>
              <button
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="hover:opacity-70"
                aria-label={`Retirer ${w}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Ajouter un mot-clé…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
        />
        <button
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </div>
    </div>
  );
}