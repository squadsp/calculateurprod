import { createFileRoute } from "@tanstack/react-router";
import { AdminSettingsShell } from "@/components/AdminSettingsShell";
import { MachinageSettings } from "@/components/settings/MachinageSettings";

export const Route = createFileRoute("/machinage-admin")({
  component: MachinageAdminPage,
});

function MachinageAdminPage() {
  return (
    <AdminSettingsShell title="Paramètres — Machinage" backTo="/portes" backLabel="Portes">
      <MachinageSettings />
    </AdminSettingsShell>
  );
}
