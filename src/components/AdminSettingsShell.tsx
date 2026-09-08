import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { login, logout, getSession } from "@/lib/auth.functions";
import { SettingsNav } from "@/components/SettingsNav";
import { ArrowLeft, Loader2, LogOut } from "lucide-react";

export function AdminSettingsShell({
  title,
  backTo,
  backLabel,
  children,
}: {
  title: string;
  backTo: "/portes" | "/fenetres" | "/";
  backLabel: string;
  children: ReactNode;
}) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  const getSess = useServerFn(getSession);
  const doLogoutFn = useServerFn(logout);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getSess({ data: undefined });
        if (mounted && res.session) setAuthed(true);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
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
          <Link to={backTo} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
          <h1 className="text-lg font-semibold">{title}</h1>
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
            {children}
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
