import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, DoorOpen, Settings as SettingsIcon } from "lucide-react";

export const Route = createFileRoute("/portes")({
  component: PortesPage,
});

function PortesPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Accueil
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Portes</h1>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <SettingsIcon className="h-4 w-4" />
            Paramètres
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex rounded-full bg-primary/10 p-5 mb-6">
          <DoorOpen className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Calculateur de portes</h2>
        <p className="mt-3 text-muted-foreground">
          En attente des spécifications. Les paramètres seront configurables dans l'admin une fois les détails fournis.
        </p>
      </main>
    </div>
  );
}
