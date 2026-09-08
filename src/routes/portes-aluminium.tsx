import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PortesCalculator } from "@/components/PortesCalculator";
import type { PortesKeywords } from "@/lib/portesProcessor";
import { getCalculatorName } from "@/lib/calculatorNames";

const EMPTY_KEYWORDS: PortesKeywords = { laminate: [], reject: [], keep: [] };

export const Route = createFileRoute("/portes-aluminium")({
  component: PortesPeinturePage,
});

function PortesPeinturePage() {
  const [name, setName] = useState("Portes Peinture");
  useEffect(() => { setName(getCalculatorName("peinture_keywords")); }, []);
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
          subtitle="Déposez un ou plusieurs PDF"
          storageKey="peinture_keywords"
          defaultKeywords={EMPTY_KEYWORDS}
          categorize={false}
        />
      </main>
    </div>
  );
}