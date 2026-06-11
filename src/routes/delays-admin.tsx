import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { login, logout, getSession } from "@/lib/auth.functions";
import { saveDelaySettings } from "@/lib/settings.functions";
import { DEFAULT_DELAY_SETTINGS, type DelaySettings } from "@/lib/columns";
import { SettingsNav } from "@/components/SettingsNav";
import { ArrowLeft, Loader2, LogOut, Save } from "lucide-react";

export const Route = createFileRoute("/delays-admin")({
  component: DelaysAdminPage,
});

type Role = "super_admin" | "admin";

function DelaysAdminPage() {
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
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
          setRole(res.session.role as Role);
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
    setRole(null);
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
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/delays" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Délais
          </Link>
          <h1 className="text-lg font-semibold">Paramètres — Délais</h1>
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
      <main className="max-w-5xl mx-auto px-6 py-10">
        {authed ? (
          <>
            <SettingsNav />
            <DelaySettingsEditor />
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

function DelaySettingsEditor() {
  const save = useServerFn(saveDelaySettings);
  const [loaded, setLoaded] = useState(false);
  const [delaySettings, setDelaySettings] = useState<DelaySettings>(DEFAULT_DELAY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("formula_settings").select("delay_settings").eq("id", 1).maybeSingle();
      if (data?.delay_settings) {
        setDelaySettings({
          ...DEFAULT_DELAY_SETTINGS,
          ...(data.delay_settings as Partial<DelaySettings>),
        });
      }
      setLoaded(true);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await save({ data: { delay_settings: delaySettings } });
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
        <h2 className="text-xl font-semibold">Paramètres du calculateur de délais</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Une semaine est considérée pleine (ignorée) lorsque la production atteint le pourcentage
          ci-dessous de la capacité (max × nombre de jours présents dans la semaine). Le délai
          minimum, l'écart de l'intervalle affiché et le décalage de semaines sont aussi configurables.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
          <span className="text-sm">Seuil « semaine pleine » (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step="1"
            value={Math.round(delaySettings.full_ratio * 100)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              const pct = isNaN(v) ? 0 : Math.max(0, Math.min(100, v));
              setDelaySettings((s) => ({ ...s, full_ratio: pct / 100 }));
            }}
            className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
          <span className="text-sm">Délai minimum (semaines)</span>
          <input
            type="number"
            min={0}
            step="1"
            value={delaySettings.min_weeks}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setDelaySettings((s) => ({ ...s, min_weeks: isNaN(v) ? 0 : v }));
            }}
            className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
          <span className="text-sm">Écart de l'intervalle (semaines)</span>
          <input
            type="number"
            min={0}
            step="1"
            value={delaySettings.range_span}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setDelaySettings((s) => ({ ...s, range_span: isNaN(v) ? 0 : v }));
            }}
            className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
          <span className="text-sm">Décalage de semaines</span>
          <input
            type="number"
            step="1"
            value={delaySettings.week_offset}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setDelaySettings((s) => ({ ...s, week_offset: isNaN(v) ? 0 : v }));
            }}
            className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
          />
        </label>
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
