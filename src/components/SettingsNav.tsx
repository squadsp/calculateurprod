import { Link, useRouterState } from "@tanstack/react-router";

const tabs = [
  { to: "/admin", label: "Fenêtres" },
  { to: "/portes-admin", label: "Jambage" },
  { to: "/machinage-admin", label: "Machinage" },
  { to: "/cadres-alu-admin", label: "Cadres Aluminium" },
  { to: "/couleurs-admin", label: "Couleurs" },
  { to: "/delays-admin", label: "Délais" },
] as const;

export function SettingsNav({ role }: { role?: string | null }) {
  const visible = role === "couleur_admin" ? tabs.filter((t) => t.to === "/couleurs-admin") : tabs;
  const path = useRouterState({
    select: (s) => s.location.pathname,
  });

  return (
    <nav className="flex gap-1 border-b border-border mb-6">
      {visible.map((tab) => {
        const active = path === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
