import { createFileRoute } from "@tanstack/react-router";
import { AdminSettingsShell } from "@/components/AdminSettingsShell";
import { CouleursSettings } from "@/components/settings/CouleursSettings";

export const Route = createFileRoute("/couleurs-admin")({
  component: CouleursAdminPage,
  head: () => ({
    meta: [
      { title: "Paramètres — Couleurs" },
      { name: "description", content: "Gestion de la liste officielle des couleurs et de leurs codes." },
      { property: "og:title", content: "Paramètres — Couleurs" },
      { property: "og:description", content: "Gestion de la liste officielle des couleurs et de leurs codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CouleursAdminPage() {
  return (
    <AdminSettingsShell title="Paramètres — Couleurs" backTo="/portes" backLabel="Portes" allowCouleurAdmin>
      <CouleursSettings />
    </AdminSettingsShell>
  );
}
