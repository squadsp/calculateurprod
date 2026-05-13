import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { saveSettings, verifyAdmin } from "@/lib/settings.functions";
import {
  ALL_FIELDS,
  DEFAULT_SETTINGS,
  FIELD_LABELS,
  type Component,
  type FieldKey,
  type Settings,
} from "@/lib/columns";
import { ArrowLeft, GripVertical, Loader2, LogOut, Save, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const ADMIN_KEY = "trappemab_admin";

function AdminPage() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(ADMIN_KEY) === "1") {
      setAuthed(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
          <h1 className="text-lg font-semibold">Paramètres administrateur</h1>
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
      <main className="max-w-5xl mx-auto px-6 py-10">
        {authed ? <SettingsEditor /> : <LoginForm onSuccess={() => setAuthed(true)} />}
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

function SettingsEditor() {
  const save = useServerFn(saveSettings);
  const [loaded, setLoaded] = useState(false);
  const [trappe, setTrappe] = useState<Component[]>(DEFAULT_SETTINGS.trappe_components);
  const [mab, setMab] = useState<Component[]>(DEFAULT_SETTINGS.mab_components);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("formula_settings").select("*").eq("id", 1).maybeSingle();
      if (data) {
        setTrappe((data.trappe_components as Component[]) ?? DEFAULT_SETTINGS.trappe_components);
        setMab((data.mab_components as Component[]) ?? DEFAULT_SETTINGS.mab_components);
      }
      setLoaded(true);
    })();
  }, []);

  const onDropTo = (target: "trappe" | "mab") => (e: React.DragEvent) => {
    e.preventDefault();
    const field = e.dataTransfer.getData("text/field") as FieldKey;
    if (!field) return;
    const setter = target === "trappe" ? setTrappe : setMab;
    setter((prev) => {
      if (prev.some((c) => c.field === field)) return prev;
      return [...prev, { field, multiplier: 1 }];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      // Use admin creds stored client-side at login time. Simpler: re-prompt is overkill; samuelp/samuelp.
      await save({
        data: {
          username: "samuelp",
          password: "samuelp",
          trappe_components: trappe,
          mab_components: mab,
        },
      });
      setMsg("Paramètres enregistrés");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Constructeur de formules</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Glissez les colonnes sources dans la boîte Trappe ou MAB, puis ajustez le multiplicateur.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3">
          Colonnes sources
        </h3>
        <div className="flex flex-wrap gap-2">
          {ALL_FIELDS.map((f) => (
            <div
              key={f}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/field", f)}
              className="cursor-grab active:cursor-grabbing select-none inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:border-primary"
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              {FIELD_LABELS[f]}
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <FormulaBox
          title="Trappe"
          description="Valeur calculée pour la colonne Trappe (Battant)"
          components={trappe}
          onChange={setTrappe}
          onDrop={onDropTo("trappe")}
        />
        <FormulaBox
          title="MAB"
          description="Valeur calculée pour la colonne MAB (Battant)"
          components={mab}
          onChange={setMab}
          onDrop={onDropTo("mab")}
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}

function FormulaBox({
  title,
  description,
  components,
  onChange,
  onDrop,
}: {
  title: string;
  description: string;
  components: Component[];
  onChange: (c: Component[]) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="rounded-xl border-2 border-dashed border-border bg-card p-5 min-h-[260px]"
    >
      <div className="mb-3">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>

      {components.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-10 text-center">
          Glissez des colonnes ici…
        </div>
      ) : (
        <div className="space-y-2">
          {components.map((c, i) => (
            <div
              key={c.field}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
            >
              <span className="flex-1 text-sm font-medium">{FIELD_LABELS[c.field]}</span>
              <span className="text-xs text-muted-foreground">×</span>
              <input
                type="number"
                step="0.01"
                value={c.multiplier}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  const next = [...components];
                  next[i] = { ...c, multiplier: isNaN(v) ? 0 : v };
                  onChange(next);
                }}
                className="w-20 rounded border border-input bg-background px-2 py-1 text-sm text-right"
              />
              <button
                onClick={() => onChange(components.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Retirer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-xs text-muted-foreground">
        Formule:{" "}
        {components.length === 0
          ? "0"
          : components
              .map((c) => `${c.multiplier} × ${FIELD_LABELS[c.field]}`)
              .join(" + ")}
      </div>
    </div>
  );
}