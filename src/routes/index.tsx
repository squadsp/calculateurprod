import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSession } from "@/lib/auth.functions";
import { DoorOpen, Settings as SettingsIcon, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const getSess = useServerFn(getSession);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getSess({ data: undefined });
        if (mounted) setIsAdmin(!!res.session);
      } catch {
        if (mounted) setIsAdmin(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getSess]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Calculateur de production</h1>
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

      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Choisissez un calculateur</h2>
          <p className="mt-2 text-muted-foreground">
            Sélectionnez le type de production à calculer.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Link
            to="/fenetres"
            className="group rounded-2xl border-2 border-foreground/40 bg-card p-8 sm:p-10 hover:border-primary/80 hover:shadow-lg transition-all flex flex-col items-center text-center gap-5"

          >
            <div className="rounded-full bg-primary/10 p-5 group-hover:bg-primary/20 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <rect x="3" y="3" width="18" height="18" rx="1.5" />
                <line x1="12" y1="3" x2="12" y2="21" />
                <line x1="3" y1="12" x2="21" y2="12" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-semibold">Fenêtres</div>
            </div>
          </Link>

          <Link
            to="/portes"
            className="group rounded-2xl border-2 border-foreground/40 bg-card p-8 sm:p-10 hover:border-primary/80 hover:shadow-lg transition-all flex flex-col items-center text-center gap-5"
          >
            <div className="rounded-full bg-primary/10 p-5 group-hover:bg-primary/20 transition-colors">
              <DoorOpen className="h-10 w-10 text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold">Portes</div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
