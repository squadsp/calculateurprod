import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { PortesCalculator } from "@/components/PortesCalculator";
import type { PortesKeywords } from "@/lib/portesProcessor";

const EMPTY_KEYWORDS: PortesKeywords = { laminate: [], reject: [], keep: [] };

export const Route = createFileRoute("/portes-peinture")({
  component: PortesPeinturePage,
});

function PortesPeinturePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/portes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Portes
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Portes Peinture</h1>
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
          title="Calculateur portes peinture"
          subtitle="Déposez un ou plusieurs PDF"
          storageKey="peinture_keywords"
          defaultKeywords={EMPTY_KEYWORDS}
          categorize={false}
        />
      </main>
    </div>
  );
}