import { createFileRoute } from "@tanstack/react-router";
import { AdminSettingsShell } from "@/components/AdminSettingsShell";
import { CadresAluSettings } from "@/components/settings/CadresAluSettings";

export const Route = createFileRoute("/cadres-alu-admin")({
  component: CadresAluAdminPage,
});

function CadresAluAdminPage() {
  return (
    <AdminSettingsShell title="Paramètres — Cadres Aluminium" backTo="/portes" backLabel="Portes">
      <CadresAluSettings />
    </AdminSettingsShell>
  );
}
