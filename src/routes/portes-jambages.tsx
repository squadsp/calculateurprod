import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PortesCalculator } from "@/components/PortesCalculator";
import { DEFAULT_PORTES_KEYWORDS } from "@/lib/portesProcessor";
import { getCalculatorName } from "@/lib/calculatorNames";

export const Route = createFileRoute("/portes-jambages")({
  component: PortesJambagesPage,
});

function PortesJambagesPage() {
  const [name, setName] = useState("Portes");
  useEffect(() => { setName(getCalculatorName("portes_keywords")); }, []);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/portes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Portes
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
          <Link
            to="/portes-admin"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <SettingsIcon className="h-4 w-4" />
            Paramètres
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">
        <PortesCalculator
          title={`Calculateur — ${name}`}
          subtitle="Déposez un ou plusieurs PDF de jambages"
          storageKey="portes_keywords"
          defaultKeywords={DEFAULT_PORTES_KEYWORDS}
          categorize
        />
      </main>
    </div>
  );
}