import { createFileRoute } from "@tanstack/react-router";
import { AdminSettingsShell } from "@/components/AdminSettingsShell";
import { JambageSettings } from "@/components/settings/JambageSettings";

export const Route = createFileRoute("/portes-admin")({
  component: PortesAdminPage,
});

function PortesAdminPage() {
  return (
    <AdminSettingsShell title="Paramètres — Jambage" backTo="/portes" backLabel="Portes">
      <JambageSettings />
    </AdminSettingsShell>
  );
}
