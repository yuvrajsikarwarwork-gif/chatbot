import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Building2, ChevronRight, Layers3, Shield, Workflow } from "lucide-react";

import DashboardLayout from "../../../components/layout/DashboardLayout";
import PageAccessNotice from "../../../components/access/PageAccessNotice";
import CommandPalette, { type CommandPaletteItem } from "../../../components/admin/CommandPalette";
import ControlTowerShell from "../../../components/admin/ControlTowerShell";
import GlobalTrafficChart from "../../../components/admin/GlobalTrafficChart";
import TimeWindowSelector from "../../../components/admin/TimeWindowSelector";
import TopConsumersTable from "../../../components/admin/TopConsumersTable";
import { useAuthStore } from "../../../store/authStore";
import { useAdminAnalyticsStore } from "../../../store/adminAnalyticsStore";
import { useVisibility } from "../../../hooks/useVisibility";
import { adminService, type GlobalTrafficPoint, type OrganizationSummary, type TopConsumer } from "../../../services/adminService";

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { canViewPage } = useVisibility();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trafficSeries, setTrafficSeries] = useState<GlobalTrafficPoint[]>([]);
  const [trafficLoading, setTrafficLoading] = useState(true);
  const [topConsumers, setTopConsumers] = useState<TopConsumer[]>([]);
  const [topConsumersLoading, setTopConsumersLoading] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const adminTimeWindow = useAdminAnalyticsStore((state) => state.adminTimeWindow);
  const setAdminTimeWindow = useAdminAnalyticsStore((state) => state.setAdminTimeWindow);

  const isSuperAdmin = String(user?.role || "").trim().toLowerCase() === "super_admin";

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    adminService
      .listOrganizations()
      .then((rows) => {
        if (!cancelled) {
          setOrganizations(rows);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.response?.data?.error || "Failed to load organizations");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setTopConsumersLoading(false);
      return;
    }

    let cancelled = false;

    adminService
      .getTopConsumers(10, adminTimeWindow)
      .then((rows) => {
        if (!cancelled) {
          setTopConsumers(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTopConsumers([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTopConsumersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adminTimeWindow, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setTrafficLoading(false);
      return;
    }

    let cancelled = false;

    adminService
      .getGlobalTrafficSeries(adminTimeWindow)
      .then((rows) => {
        if (!cancelled) {
          setTrafficSeries(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrafficSeries([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTrafficLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adminTimeWindow, isSuperAdmin]);

  const timeWindowLabel =
    adminTimeWindow === "30 days"
      ? "Billing Cycle"
      : adminTimeWindow === "7 days"
        ? "Last 7d"
        : "Last 24h";

  const totals = useMemo(
    () => ({
      organizations: organizations.length,
      active: organizations.filter((org) => org.isActive !== false).length,
      inactive: organizations.filter((org) => org.isActive === false).length,
      workspaces: organizations.reduce((sum, org) => sum + (org.workspaceCount || 0), 0),
    }),
    [organizations]
  );

  const commandItems = useMemo<CommandPaletteItem[]>(
    () =>
      organizations.map((org) => ({
        id: org.id,
        kind: "org",
        title: org.name,
        description: [org.slug, org.id].filter(Boolean).join(" • "),
        keywords: [org.planTier || "", org.workspaceCount ? `${org.workspaceCount} workspaces` : ""].filter(Boolean),
      })),
    [organizations]
  );

  const handleSearchSelect = async (item: CommandPaletteItem) => {
    setCommandPaletteOpen(false);
    if (!item?.id) {
      return;
    }

    await router.push(`/admin/organizations/${item.id}`);
  };

  return (
    <DashboardLayout title="Control Tower | Organizations">
      {!isSuperAdmin ? (
        <PageAccessNotice
          title="Organization control is restricted"
          description="Only super admin users can open the Control Tower and inspect tenant governance."
          href={canViewPage("workspaces") ? "/workspaces" : "/"}
          ctaLabel={canViewPage("workspaces") ? "Open workspaces" : "Open dashboard"}
        />
      ) : (
        <ControlTowerShell
          orgCount={totals.organizations}
          breadcrumb="Admin / Control Tower"
          onSearchActivate={() => setCommandPaletteOpen(true)}
          utilitySlot={<TimeWindowSelector value={adminTimeWindow} onChange={setAdminTimeWindow} />}
        >
          <CommandPalette
            open={commandPaletteOpen}
            items={commandItems}
            onSelect={handleSearchSelect}
            onClose={() => setCommandPaletteOpen(false)}
            placeholder="Search organizations..."
            title="Ctrl / Org"
          />
          <div className="space-y-6">
            <section className="rounded-[1.9rem] border border-border-main bg-[linear-gradient(180deg,rgba(91,33,182,0.06),rgba(255,255,255,0.98))] p-6 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">
                    Control Tower
                  </div>
                  <h1 className="mt-3 text-[2rem] font-black tracking-[-0.04em] text-text-main">
                    Organization Governance
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">
                    Inspect every tenant, open the org detail view, and drill into the Meta template manager without leaving the platform.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricCard label="Organizations" value={totals.organizations} icon={<Building2 size={16} />} />
                  <MetricCard label="Active" value={totals.active} icon={<Shield size={16} />} />
                  <MetricCard label="Workspaces" value={totals.workspaces} icon={<Workflow size={16} />} />
                  <MetricCard label="Inactive" value={totals.inactive} icon={<Layers3 size={16} />} />
                </div>
              </div>
            </section>

            <GlobalTrafficChart data={trafficSeries} loading={trafficLoading} timeWindowLabel={timeWindowLabel} />

            <TopConsumersTable consumers={topConsumers} loading={topConsumersLoading} timeWindowLabel={timeWindowLabel} />

            <section className="rounded-[1.75rem] border border-border-main bg-surface shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-border-main px-6 py-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-text-muted">
                    Directory
                  </div>
                  <div className="mt-1 text-lg font-semibold tracking-tight text-text-main">
                    All organizations
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-fade px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  Super Admin View
                </div>
              </div>

              {loading ? (
                <div className="p-10 text-sm text-text-muted">Loading organizations...</div>
              ) : error ? (
                <div className="p-6 text-sm text-rose-700">{error}</div>
              ) : organizations.length === 0 ? (
                <div className="p-10 text-sm text-text-muted">No organizations have been created yet.</div>
              ) : (
                <div className="overflow-hidden">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-canvas text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                      <tr>
                        <th className="px-6 py-4">Organization</th>
                        <th className="px-6 py-4">Plan</th>
                        <th className="px-6 py-4">Workspaces</th>
                        <th className="px-6 py-4">Members</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-main">
                      {organizations.map((org) => (
                        <tr key={org.id} className="group hover:bg-canvas/60">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <div className="text-sm font-bold text-text-main">{org.name}</div>
                              <div className="mt-1 text-[10px] font-mono text-text-muted">{org.id}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex rounded-full border border-border-main bg-canvas px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                              {String(org.planTier || "free").replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-text-main">
                            {org.workspaceCount || 0}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-text-main">
                            {org.memberCount || 0}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
                                org.isActive === false
                                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {org.isActive === false ? "Suspended" : "Active"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link
                              href={`/admin/organizations/${org.id}`}
                              className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                            >
                              Manage
                              <ChevronRight size={14} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </ControlTowerShell>
      )}
    </DashboardLayout>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-[1.25rem] border border-border-main bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-text-muted">{label}</div>
        <div className="rounded-lg border border-border-main bg-canvas p-1.5 text-text-muted">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-text-main">{value}</div>
    </div>
  );
}
