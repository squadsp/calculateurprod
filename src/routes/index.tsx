import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppWindow, DoorOpen, Settings as SettingsIcon, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsAdmin(sessionStorage.getItem("trappemab_admin") === "1");
    }
  }, []);

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
            className="group rounded-2xl border-2 border-border bg-card p-8 hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-4"
          >
            <div className="rounded-full bg-primary/10 p-5 group-hover:bg-primary/20 transition-colors">
              <AppWindow className="h-10 w-10 text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold">Fenêtres</div>
            </div>
          </Link>

          <Link
            to="/portes"
            className="group rounded-2xl border-2 border-border bg-card p-8 hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-4"
          >
            <div className="rounded-full bg-primary/10 p-5 group-hover:bg-primary/20 transition-colors">
              <DoorOpen className="h-10 w-10 text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold">Portes</div>
              <p className="text-sm text-muted-foreground mt-1">
                Calculateur de portes
              </p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
