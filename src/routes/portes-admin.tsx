import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { login, logout, getSession } from "@/lib/auth.functions";
import { DEFAULT_PORTES_KEYWORDS, type PortesKeywords } from "@/lib/portesProcessor";
import { SettingsNav } from "@/components/SettingsNav";
import { getCalculatorName, setCalculatorName, getDefaultCalculatorName, type CalculatorKey } from "@/lib/calculatorNames";
import { ArrowLeft, Loader2, LogOut, Save, Plus, X, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/portes-admin")({
  component: PortesAdminPage,
});

const EMPTY_KEYWORDS: PortesKeywords = { laminate: [], reject: [], keep: [] };

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

function PortesAdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  const getSess = useServerFn(getSession);
  const doLogoutFn = useServerFn(logout);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getSess({ data: undefined });
        if (mounted && res.session) {
          setAuthed(true);
        }
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [getSess]);

  const doLogout = async () => {
    try {
      await doLogoutFn({ data: undefined });
    } catch {
      // ignore
    }
    setAuthed(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
              onClick={doLogout}
            >
              <LogOut className="h-4 w-4" /> Déconnexion
            </button>
          ) : (
            <span className="w-16" />
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-10">
        {authed ? (
          <>
            <SettingsNav />
            <PortesSettingsEditor
              heading="Mots-clés du traitement des portes"
              storageKey="portes_keywords"
              defaultKeywords={DEFAULT_PORTES_KEYWORDS}
              showSpecialRule
            />
            <div className="my-10 border-t border-border" />
            <PortesSettingsEditor
              heading="Mots-clés du traitement de la peinture"
              storageKey="peinture_keywords"
              defaultKeywords={EMPTY_KEYWORDS}
              showSpecialRule={false}
            />
            <div className="my-10 border-t border-border" />
            <MachinageNameEditor />
          </>
        ) : (
          <LoginForm onSuccess={() => setAuthed(true)} />
        )}
      </main>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const doLogin = useServerFn(login);
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
          await doLogin({ data: { username: u, password: p } });
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

function PortesSettingsEditor({
  heading,
  storageKey,
  defaultKeywords,
  showSpecialRule,
}: {
  heading: string;
  storageKey: CalculatorKey;
  defaultKeywords: PortesKeywords;
  showSpecialRule: boolean;
}) {
  const [kw, setKw] = useState<PortesKeywords>(defaultKeywords);
  const [name, setName] = useState<string>(getDefaultCalculatorName(storageKey));
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setKw(loadKeywords(storageKey, defaultKeywords));
    setName(getCalculatorName(storageKey));
  }, [storageKey, defaultKeywords]);

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
    setKw(defaultKeywords);
    setName(getDefaultCalculatorName(storageKey));
    setCalculatorName(storageKey, "");
    localStorage.removeItem(storageKey);
    setMsg("Valeurs par défaut restaurées");
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">{heading}</h2>
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
        description={
          showSpecialRule
            ? `Lignes conservées par défaut. Règle spéciale : "1\" 1/4" est conservé sauf si suivi de "-<chiffre>" autre que "-7".`
            : "Lignes conservées si elles contiennent un de ces mots."
        }
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

function MachinageNameEditor() {
  const [name, setName] = useState<string>(getDefaultCalculatorName("machinage"));
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setName(getCalculatorName("machinage")); }, []);

  const save = () => {
    setCalculatorName("machinage", name);
    setMsg("Nom enregistré");
    setTimeout(() => setMsg(null), 2000);
  };
  const reset = () => {
    const def = getDefaultCalculatorName("machinage");
    setName(def);
    setCalculatorName("machinage", "");
    setMsg("Nom réinitialisé");
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Extracteur Machinage</h2>
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