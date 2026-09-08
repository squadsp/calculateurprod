import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Settings as SettingsIcon, DoorOpen, PaintBucket, Cog } from "lucide-react";
import { useEffect, useState } from "react";
import { getCalculatorName } from "@/lib/calculatorNames";

export const Route = createFileRoute("/portes")({
  component: PortesHub,
});

function PortesHub() {
  const [portesName, setPortesName] = useState("Jambage");
  const [aluminiumName, setAluminiumName] = useState("Portes Aluminium");
  const [machinageName, setMachinageName] = useState("Machinage");
  useEffect(() => {
    setPortesName(getCalculatorName("portes_keywords"));
    setAluminiumName(getCalculatorName("aluminium_keywords"));
    setMachinageName(getCalculatorName("machinage"));
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Accueil
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Portes</h1>
          <Link
            to="/portes-admin"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <SettingsIcon className="h-4 w-4" />
            Paramètres
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Choisissez un calculateur</h2>
          <p className="mt-2 text-muted-foreground">
            Sélectionnez le type de calcul de portes.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Link
            to="/portes-jambages"
            className="group rounded-2xl border-2 border-border bg-card p-8 hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-4"
          >
            <div className="rounded-full bg-primary/10 p-5 group-hover:bg-primary/20 transition-colors">
              <DoorOpen className="h-10 w-10 text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold">{portesName}</div>
            </div>
          </Link>

          <Link
            to="/portes-aluminium"
            className="group rounded-2xl border-2 border-border bg-card p-8 hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-4"
          >
            <div className="rounded-full bg-primary/10 p-5 group-hover:bg-primary/20 transition-colors">
              <PaintBucket className="h-10 w-10 text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold">{aluminiumName}</div>
            </div>
          </Link>

          <Link
            to="/portes-machinage"
            className="group rounded-2xl border-2 border-border bg-card p-8 hover:border-primary hover:shadow-lg transition-all flex flex-col items-center text-center gap-4 sm:col-span-2"
          >
            <div className="rounded-full bg-primary/10 p-5 group-hover:bg-primary/20 transition-colors">
              <Cog className="h-10 w-10 text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold">{machinageName}</div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}