import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { fmtDay, isoDate, weekStart } from "@/lib/siteReports";
import { fetchLastWo, fetchMaterials, fetchProjects, fetchRecentReports, reporterName, setReporterName } from "@/lib/siteReportsApi";
import { useSitePwa } from "@/lib/sitePwa";
import DailyReportTab from "@/components/site-reports/DailyReportTab";
import WeeklyPlanTab from "@/components/site-reports/WeeklyPlanTab";
import DashboardTab from "@/components/site-reports/DashboardTab";
import { OrdersList, OrderStageForm } from "@/components/site-reports/OrdersTab";
import { DeploymentStage, ScheduleStage } from "@/components/site-reports/OrderDays";
import { EquipmentTab, ManpowerTab } from "@/components/site-reports/RegistersTab";
import { orderChip, orderDone, projectHeadline, stageName, type SiteOrder, type SiteTool, type SiteWorker } from "@/lib/siteOrders";
import { fetchOrders, fetchTools, fetchWorkers } from "@/lib/siteOrdersApi";
import { type SiteMaterial, type SiteProject } from "@/components/site-reports/pickers";
import {
  Banner,
  Button,
  Card,
  CardHead,
  Chip,
  FabNew,
  Field,
  IconButton,
  Kv,
  Note,
  Placeholder,
  SectionLabel,
  Select,
  TabButton,
  TextInput,
  TopBar,
  Tracker,
} from "@/components/site-reports/primitives";
import "@/components/site-reports/theme.css";

/*
  ConPlus — Site Reports
  ----------------------
  Lynn's project planning & tracking workflow (18 Sep, R1 25 Sep):
    Daily report  — DAILY WORK REPORT + DAILY MATERIAL REPORT (planned / actual / defect),
                    Save draft before work -> finish ACTUAL at the end of the day -> Submit
    Weekly plan   — the Monday whiteboard as rows
    Progress      — the per-project Dashboard Report, with Excel export
  Built screen for screen on the client's SitePulse mockup (Oct 2026):
    Active Projects (cards + filters, navbar)
    -> project: Orders | Reports | Plan | Progress
       -> an order stage / a report: the edit screen with the stacked button row, no navbar
    Manpower, Equipment: the registers and where each person / tool is today.
    Settings: reporter name, install, help.
  Orders (16 Nov 2026): a project holds one or more orders (phases); each walks
  Project Plan -> Kick Off -> Schedule Posting -> Deployment & Execution ->
  Site Walk / Handover -> Transfer / Movement -> Completion on its own.
  Installable (manifest + service worker, see lib/sitePwa.ts). The URL carries
  ?project=&tab=&date=&week=&report= so a link opens the same view.
*/

type Tab = "projects" | "orders" | "order" | "reports" | "daily" | "plan" | "progress" | "manpower" | "equipment" | "settings";
const GLOBAL_TABS: Tab[] = ["projects", "manpower", "equipment", "settings"];
const LAST_PROJECT_KEY = "conplus_site_reports_project";

const readLastProject = () => {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) || "";
  } catch {
    return "";
  }
};

type DayStatus = "draft" | "submitted";
type Recent = Awaited<ReturnType<typeof fetchRecentReports>>[number];

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: "projects", icon: "🗂️", label: "Projects" },
  { id: "manpower", icon: "👷", label: "Manpower" },
  { id: "equipment", icon: "🧰", label: "Equipment" },
  { id: "settings", icon: "⚙️", label: "Settings" },
];
const PROJECT_TABS: { id: Tab; label: string }[] = [
  { id: "orders", label: "Orders" },
  { id: "reports", label: "Reports" },
  { id: "plan", label: "Plan" },
  { id: "progress", label: "Progress" },
];

function readTab(raw: string | null, hasProject: boolean): Tab {
  if (raw === "dashboard") return "progress";
  if (raw && ["projects", "orders", "order", "reports", "daily", "plan", "progress", "manpower", "equipment", "settings"].includes(raw)) {
    const t = raw as Tab;
    return hasProject || GLOBAL_TABS.includes(t) ? t : "projects";
  }
  return hasProject ? "orders" : "projects";
}

/**
 * embedded: rendered inside the v1 AppLayout, whose <main> scrolls with 24px
 * padding. The page bleeds over it (-m-6). Top bar and bottom nav are sticky
 * to whichever element scrolls (the window in the client build, the pane
 * inside the app shell).
 */
export default function SiteReportsPage({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<SiteProject[]>([]);
  const [materials, setMaterials] = useState<SiteMaterial[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [lastWo, setLastWo] = useState("");
  const [locationHints, setLocationHints] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dailyDirty, setDailyDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [todayStatus, setTodayStatus] = useState<Record<string, DayStatus>>({});
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [orders, setOrders] = useState<SiteOrder[] | null>(null);
  const [workers, setWorkers] = useState<SiteWorker[] | null>(null);
  const [tools, setTools] = useState<SiteTool[] | null>(null);
  const pwa = useSitePwa();

  const today = isoDate(new Date());
  const code = params.get("project") || readLastProject();
  const project = useMemo(() => projects.find((p) => p.project_code === code) ?? null, [projects, code]);
  const tab = readTab(params.get("tab"), !!code);
  const date = params.get("date") || today;
  const week = weekStart(params.get("week") || date);
  const reportParam = params.get("report"); // "new", an id, or null (that day's first report)
  const orderParam = params.get("order"); // "new" or an order id
  const stageParam = Math.min(7, Math.max(1, parseInt(params.get("stage") || "1", 10) || 1));
  const projectOrders = useMemo(() => (project && orders ? orders.filter((o) => o.project_id === project.id) : null), [orders, project]);
  const order = useMemo(() => (orderParam && orderParam !== "new" ? (orders?.find((o) => o.id === orderParam) ?? null) : null), [orders, orderParam]);

  const patch = useCallback(
    (next: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) (v == null ? p.delete(k) : p.set(k, v));
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  useEffect(() => {
    document.title = "Site Reports · CONPLUS";
    (async () => {
      const [ps, ms] = await Promise.all([fetchProjects(), fetchMaterials()]);
      setProjects(ps);
      setMaterials(ms);
      setLoadingProjects(false);
    })();
  }, []);

  // Orders of every project (cards, registers) and the two registers.
  const loadOrders = useCallback(() => {
    fetchOrders().then(setOrders);
  }, []);
  const loadRegisters = useCallback(() => {
    fetchWorkers().then(setWorkers);
    fetchTools().then(setTools);
  }, []);
  useEffect(() => {
    loadOrders();
    loadRegisters();
  }, [loadOrders, loadRegisters]);

  // Today's report per project, for the chip on each project card.
  useEffect(() => {
    if (tab !== "projects") return;
    (async () => {
      const { data } = await supabase.from("site_daily_reports").select("project_id,status").eq("report_date", today);
      const m: Record<string, DayStatus> = {};
      for (const r of (data as { project_id: string; status: string }[]) ?? []) {
        if (r.status === "submitted" || m[r.project_id] !== "submitted") m[r.project_id] = r.status === "submitted" ? "submitted" : "draft";
      }
      setTodayStatus(m);
    })();
  }, [tab, today, refreshKey]);

  // The project's reports, for the Reports screen.
  useEffect(() => {
    if (!project) return;
    setRecent(null);
    fetchRecentReports(project.id, 40).then(setRecent);
  }, [project, refreshKey]);

  // Remember the project, and keep it in the URL once it resolves.
  useEffect(() => {
    if (!project) return;
    try {
      localStorage.setItem(LAST_PROJECT_KEY, project.project_code);
    } catch {
      /* not remembered in private mode */
    }
    if (params.get("project") !== project.project_code) patch({ project: project.project_code });
  }, [project, params, patch]);

  useEffect(() => {
    if (!project) return;
    setLastWo("");
    fetchLastWo(project).then(setLastWo);
  }, [project]);

  // Location suggestions: what this project's plan and reports already use.
  useEffect(() => {
    if (!project) return;
    (async () => {
      const [{ data: plan }, { data: reps }] = await Promise.all([
        supabase.from("site_weekly_plan").select("location").eq("project_id", project.id).limit(500),
        supabase.from("site_daily_reports").select("site_location, site_report_lines(location)").eq("project_id", project.id).limit(200),
      ]);
      const set = new Set<string>();
      for (const r of (plan as { location: string | null }[]) ?? []) if (r.location) set.add(r.location);
      for (const r of (reps as { site_location: string; site_report_lines: { location: string | null }[] }[]) ?? []) {
        if (r.site_location) set.add(r.site_location);
        for (const l of r.site_report_lines ?? []) if (l.location) set.add(l.location);
      }
      setLocationHints([...set].sort((a, b) => a.localeCompare(b)));
    })();
  }, [project, refreshKey]);

  const changed = useCallback(() => setRefreshKey((k) => k + 1), []);
  const guardNav = (action: () => void) => (dailyDirty ? setPendingNav(() => action) : action());

  const go = (t: Tab) => guardNav(() => patch({ tab: t, report: null, date: null, order: null, stage: null }));
  const openProject = (p: SiteProject) =>
    guardNav(() => patch({ project: p.project_code, tab: "orders", date: null, week: null, report: null, order: null, stage: null }));
  const openOrderStage = (orderId: string, stage: number, projectCode?: string) =>
    patch({ ...(projectCode ? { project: projectCode } : {}), tab: "order", order: orderId, stage: String(stage), report: null, date: null });
  const backToOrders = () => patch({ tab: "orders", order: null, stage: null });
  const openReport = (d: string, id: string | "new" | null) => guardNav(() => patch({ tab: "daily", date: d === today ? null : d, report: id }));

  const projectSub = project ? [project.project_code, project.client_name, project.location].filter(Boolean).join(" · ") : "";

  const offline = !pwa.online && (
    <Banner tone="warn" icon={<span aria-hidden>📡</span>}>
      <b>You are offline.</b> Reports cannot be saved or submitted until the connection is back.
    </Banner>
  );

  return (
    <div className={cn("sr-app sr-ground", embedded ? "-m-6 min-h-[calc(100%+3rem)]" : "min-h-screen")}>
      <div className="sr-phone">
        {/* ── Active Projects ── */}
        {tab === "projects" && (
          <>
            <TopBar
              title="Active Projects"
              right={
                pwa.canInstall && !pwa.installed ? (
                  <IconButton text onClick={pwa.install} title="Add Site Reports to your home screen">
                    ⬇ Install
                  </IconButton>
                ) : undefined
              }
              block={
                <div className="mt-2 text-[11px] leading-[1.6] text-[var(--ink-muted)]">
                  {loadingProjects
                    ? "Loading projects…"
                    : `${projects.length} active projects · ${(orders ?? []).filter((o) => !orderDone(o)).length} open orders · ${Object.values(todayStatus).filter((s) => s === "submitted").length} reports submitted today · chips show the order stage`}
                </div>
              }
            />
            <ProjectsScreen projects={projects} orders={orders ?? []} loading={loadingProjects} todayStatus={todayStatus} onOpen={openProject} pwa={pwa} offline={offline} />
            <NavBar tab={tab} go={go} />
          </>
        )}

        {/* ── Project: Orders (each one a phase, with its seven-stage rail) ── */}
        {tab === "orders" && project && (
          <>
            <TopBar back onBack={() => go("projects")} title={project.name} sub={projectSub} block={<ProjectTabs tab={tab} go={go} />} />
            <div className="sr-scroll">
              {offline}
              <OrdersList orders={projectOrders} onNew={() => patch({ tab: "order", order: "new", stage: "1" })} onOpen={(o, s) => openOrderStage(o.id, s)} />
            </div>
            <NavBar tab={tab} go={go} />
          </>
        )}

        {/* ── An order stage (edit screen: button row, no navbar) ── */}
        {tab === "order" && project && (orderParam === "new" || order) && (
          <>
            <TopBar
              back
              onBack={backToOrders}
              title={orderParam === "new" ? "New Order" : stageName(stageParam)}
              sub={orderParam === "new" || !order ? project.name : `${project.project_code} · ${order.label} · Stage ${stageParam} of 7`}
            />
            {offline}
            {order && stageParam === 3 ? (
              <ScheduleStage key={order.id} order={order} workers={workers ?? []} tools={tools ?? []} allOrders={orders ?? []} onSaved={loadOrders} onBack={backToOrders} onOpenStage={openOrderStage} onOpenReport={() => undefined} />
            ) : order && stageParam === 4 ? (
              <DeploymentStage
                key={order.id}
                order={order}
                workers={workers ?? []}
                tools={tools ?? []}
                allOrders={orders ?? []}
                onSaved={loadOrders}
                onBack={backToOrders}
                onOpenStage={openOrderStage}
                onOpenReport={(d) => patch({ tab: "daily", date: d === today ? null : d, report: null, order: null, stage: null })}
              />
            ) : (
              <OrderStageForm
                key={`${order?.id ?? "new"}:${stageParam}`}
                project={project}
                order={order}
                stage={orderParam === "new" ? 1 : stageParam}
                workers={workers ?? []}
                tools={tools ?? []}
                onSaved={loadOrders}
                onBack={backToOrders}
                onOpenStage={openOrderStage}
              />
            )}
          </>
        )}
        {tab === "order" && project && orderParam !== "new" && !order && (
          <>
            <TopBar back onBack={backToOrders} title="Order" sub={project.name} />
            {orders === null ? (
              <div className="sr-scroll">
                <div className="sr-skeleton" />
              </div>
            ) : (
              <Placeholder icon="🗂️" title="Order not found" action={<Button variant="primary" onClick={backToOrders}>Back to orders</Button>}>
                This order is no longer on the project.
              </Placeholder>
            )}
          </>
        )}

        {/* ── Project: Reports list ── */}
        {tab === "reports" && project && (
          <>
            <TopBar back onBack={() => go("projects")} title={project.name} sub={projectSub} block={<ProjectTabs tab={tab} go={go} />} />
            <div className="sr-scroll">
              {offline}
              <FabNew onClick={() => openReport(today, "new")}>＋ New report</FabNew>
              <ReportsList recent={recent} today={today} onOpen={(r) => openReport(r.report_date, r.id)} />
            </div>
            <NavBar tab={tab} go={go} />
          </>
        )}

        {/* ── A daily report (edit screen: button row, no navbar) ── */}
        {tab === "daily" && project && (
          <>
            <TopBar back onBack={() => go("reports")} title="Daily report" sub={`${project.project_code} · ${project.name}`} />
            {offline}
            <DailyReportTab
              key={`${project.id}:${date}:${reportParam ?? ""}`}
              project={project}
              materials={materials}
              date={date}
              reportId={reportParam}
              onDateChange={(d) => patch({ date: d === today ? null : d, report: null })}
              onChanged={changed}
              onDirtyChange={setDailyDirty}
              onBack={() => patch({ tab: "reports", report: null, date: null })}
              resetSignal={resetSignal}
              locationHints={locationHints}
            />
          </>
        )}

        {/* ── Project: Weekly plan ── */}
        {tab === "plan" && project && (
          <>
            <TopBar back onBack={() => go("projects")} title={project.name} sub={projectSub} block={<ProjectTabs tab={tab} go={go} />} />
            <div className="sr-scroll">
              {offline}
              <WeeklyPlanTab
                key={project.id}
                project={project}
                week={week}
                onWeekChange={(w) => patch({ week: w === weekStart(today) ? null : w })}
                onChanged={changed}
                locationHints={locationHints}
              />
            </div>
            <NavBar tab={tab} go={go} />
          </>
        )}

        {/* ── Project: Progress (the Dashboard Report) ── */}
        {tab === "progress" && project && (
          <>
            <TopBar back onBack={() => go("projects")} title={project.name} sub={projectSub} block={<ProjectTabs tab={tab} go={go} />} />
            <div className="sr-scroll">
              {offline}
              <DashboardTab key={project.id} project={project} lastWo={lastWo} refreshKey={refreshKey} onOpenDay={(d) => openReport(d, null)} />
            </div>
            <NavBar tab={tab} go={go} />
          </>
        )}

        {/* A project tab with the project still loading, or a code that no longer exists. */}
        {!GLOBAL_TABS.includes(tab) && !project && (
          <>
            <TopBar back onBack={() => go("projects")} title="Site Reports" />
            {loadingProjects ? (
              <div className="sr-scroll">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="sr-skeleton" />
                ))}
              </div>
            ) : (
              <Placeholder icon="🗂️" title="Pick a project" action={<Button variant="primary" onClick={() => go("projects")}>All projects</Button>}>
                The project in this link is not active any more.
              </Placeholder>
            )}
            <NavBar tab={tab} go={go} />
          </>
        )}

        {/* ── Manpower / Equipment: the registers, and where everyone and everything is ── */}
        {tab === "manpower" && (
          <>
            <TopBar title="Manpower" sub="Roster and where each person is" />
            <ManpowerTab workers={workers} allOrders={orders ?? []} onChanged={loadRegisters} onOpenOrder={(p) => openOrderStage(p.order_id, 4, p.project_code)} />
            <NavBar tab={tab} go={go} />
          </>
        )}
        {tab === "equipment" && (
          <>
            <TopBar title="Equipment" sub="Tool register and where each tool is" />
            <EquipmentTab tools={tools} allOrders={orders ?? []} onChanged={loadRegisters} onOpenOrder={(p) => openOrderStage(p.order_id, 4, p.project_code)} />
            <NavBar tab={tab} go={go} />
          </>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <>
            <TopBar title="Settings" sub="Account, app & help" />
            <SettingsScreen pwa={pwa} offline={offline} />
            <NavBar tab={tab} go={go} />
          </>
        )}
      </div>

      <AlertDialog open={pendingNav !== null} onOpenChange={(o) => !o && setPendingNav(null)}>
        <AlertDialogContent className="sr-app max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">Discard the unsaved daily report?</AlertDialogTitle>
            <AlertDialogDescription>The open daily report has edits that are not saved. Go back to it and save the draft to keep them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Back to the report</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl"
              onClick={() => {
                const a = pendingNav;
                setPendingNav(null);
                setDailyDirty(false);
                setResetSignal((n) => n + 1);
                a?.();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Orders · Reports · Plan · Progress, under a project's top bar. */
function ProjectTabs({ tab, go }: { tab: Tab; go: (t: Tab) => void }) {
  return (
    <div className="mt-2.5 flex gap-1.5" role="group" aria-label="Project sections">
      {PROJECT_TABS.map((t) => (
        <TabButton key={t.id} active={tab === t.id} onClick={() => go(t.id)}>
          {t.label}
        </TabButton>
      ))}
    </div>
  );
}

function NavBar({ tab, go }: { tab: Tab; go: (t: Tab) => void }) {
  return (
    <nav className="sr-navbar sticky bottom-0 z-40" aria-label="Site Reports sections">
      {NAV.map((n) => {
        const active = tab === n.id || (n.id === "projects" && !GLOBAL_TABS.includes(tab));
        return (
          <button key={n.id} type="button" className={cn("sr-navitem", active && "active")} aria-current={active ? "page" : undefined} onClick={() => go(n.id)}>
            <span className="sr-ic" aria-hidden>
              {n.icon}
            </span>
            {n.label}
          </button>
        );
      })}
    </nav>
  );
}

/** The mockup's "Active Projects": filters under the top bar, then one card per project. */
function ProjectsScreen({
  projects,
  orders,
  loading,
  todayStatus,
  onOpen,
  pwa,
  offline,
}: {
  projects: SiteProject[];
  orders: SiteOrder[];
  loading: boolean;
  todayStatus: Record<string, DayStatus>;
  onOpen: (p: SiteProject) => void;
  pwa: ReturnType<typeof useSitePwa>;
  offline: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "orders" | "reported" | "missing">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const needle = q.trim().toLowerCase();
  const byProject = useMemo(() => {
    const m = new Map<string, SiteOrder[]>();
    for (const o of orders) m.set(o.project_id, [...(m.get(o.project_id) ?? []), o]);
    return m;
  }, [orders]);
  const list = useMemo(() => {
    let l = projects;
    if (needle) l = l.filter((p) => `${p.project_code} ${p.name} ${p.client_name ?? ""} ${p.location ?? ""}`.toLowerCase().includes(needle));
    if (filter === "orders") l = l.filter((p) => (byProject.get(p.id) ?? []).some((o) => !orderDone(o)));
    if (filter === "reported") l = l.filter((p) => todayStatus[p.id]);
    if (filter === "missing") l = l.filter((p) => !todayStatus[p.id]);
    // Projects with open orders first: that is where the day's work is.
    const open = (p: SiteProject) => ((byProject.get(p.id) ?? []).some((o) => !orderDone(o)) ? 0 : 1);
    return [...l].sort((a, b) => open(a) - open(b));
  }, [projects, needle, filter, todayStatus, byProject]);

  return (
    <>
      <div className="sr-filters">
        <div className="sr-filters-row">
          <TextInput
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, project, client or site"
            aria-label="Search projects"
            className="!min-h-[36px] !py-2 !text-[12px] !font-semibold"
          />
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter projects" className="w-[46%] shrink-0">
            <option value="all">All projects</option>
            <option value="orders">With open orders</option>
            <option value="reported">Reported today</option>
            <option value="missing">No report today</option>
          </Select>
        </div>
      </div>
      <div className="sr-scroll">
        {offline}
        {!pwa.dismissed && !pwa.installed && pwa.showIosHint && (
          <Banner tone="info" icon={<span aria-hidden>📲</span>}>
            Add Site Reports to your home screen: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.{" "}
            <button type="button" onClick={pwa.dismiss} className="font-semibold underline">
              Dismiss
            </button>
          </Banner>
        )}
        {loading ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="sr-skeleton" />)
        ) : list.length === 0 ? (
          <Placeholder icon="🔍" title="No matching projects">
            {filter === "orders"
              ? "No project has an open order yet. Open a project and tap New order."
              : filter === "reported"
                ? "No report has been started for today yet."
                : filter === "missing"
                  ? "Every project has a report today."
                  : "Search by project code, name, client or site."}
          </Placeholder>
        ) : (
          list.map((p) => {
            const st = todayStatus[p.id];
            const mine = byProject.get(p.id) ?? [];
            const head = projectHeadline(mine);
            const open = !!expanded[p.id];
            const report = st === "submitted" ? "today's report submitted" : st === "draft" ? "today's report in draft" : "no report today";
            return (
              <div key={p.id} className="relative">
                <Card onClick={() => onOpen(p)}>
                  <CardHead name={p.name} meta={[p.project_code, p.client_name].filter(Boolean).join(" · ")} right={<Chip tone={head.tone}>{head.text}</Chip>} />
                  {open && mine.length > 0 ? (
                    mine.map((o) => {
                      const c = orderChip(o);
                      return (
                        <div key={o.id} className="sr-order-line pr-9">
                          <span className="sr-dot" style={{ background: c.tone === "good" ? "var(--good)" : "var(--sky)" }} />
                          <span className="sr-nm">{o.label}</span>
                          <span className="sr-st">{c.text}</span>
                        </div>
                      );
                    })
                  ) : (
                    <Note className={mine.length ? "pr-9" : undefined}>
                      {mine.length ? `${mine.length} order${mine.length > 1 ? "s" : ""} · ${report}` : [p.location, p.coating_system].filter(Boolean).join(" · ") || report}
                    </Note>
                  )}
                </Card>
                {mine.length > 0 && (
                  <button
                    type="button"
                    className="sr-iconbtn absolute bottom-[22px] right-3 !h-[26px] !w-[26px] !text-[12px]"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} the order list of ${p.name}`}
                    onClick={() => setExpanded((e) => ({ ...e, [p.id]: !open }))}
                  >
                    {open ? "▾" : "▸"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/** The project's reports, newest first, each with the mockup's small stage rail. */
function ReportsList({ recent, today, onOpen }: { recent: Recent[] | null; today: string; onOpen: (r: Recent) => void }) {
  if (recent === null) {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div key={i} className="sr-skeleton" />
        ))}
      </>
    );
  }
  if (recent.length === 0) {
    return (
      <Placeholder icon="📝" title="No reports yet">
        Tap "New report" above to start today's. Save it before work, finish ACTUAL at the end of the day, then submit.
      </Placeholder>
    );
  }
  return (
    <>
      <SectionLabel>Reports</SectionLabel>
      {recent.map((r) => {
        const submitted = r.status === "submitted";
        return (
          <Card key={r.id} onClick={() => onOpen(r)} ariaLabel={`Open the ${fmtDay(r.report_date)} report${r.site_location ? ` at ${r.site_location}` : ""}`}>
            <CardHead
              small
              name={r.report_date === today ? `Today · ${fmtDay(r.report_date)}` : fmtDay(r.report_date)}
              meta={r.site_location || "No site location"}
              right={submitted ? <Chip tone="good">Submitted</Chip> : <Chip tone="warn">Draft</Chip>}
            />
            <Tracker
              small
              label="Report stage"
              steps={[
                { title: "Before work", desc: "Draft saved", state: "done" },
                { title: "End of day", desc: submitted ? "Completed" : "Fill ACTUAL", state: submitted ? "done" : "active" },
                { title: "Submitted", desc: submitted ? "Read-only" : "Upcoming", state: submitted ? "done" : "locked" },
              ]}
            />
          </Card>
        );
      })}
    </>
  );
}

/** Reporter name (no logins in this app), install, help. */
function SettingsScreen({ pwa, offline }: { pwa: ReturnType<typeof useSitePwa>; offline: ReactNode }) {
  const [name, setName] = useState(reporterName());
  const [savedName, setSavedName] = useState(reporterName());
  return (
    <div className="sr-scroll">
      {offline}
      <SectionLabel>Account</SectionLabel>
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setReporterName(name);
            setSavedName(name.trim());
          }}
        >
          <Field label="Reporting as" hint="Saved on this device and stamped on every save and submission.">
            {(id, d) => <TextInput id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="e.g. Lynn" />}
          </Field>
          <Button variant="primary" type="submit" disabled={name.trim() === savedName}>
            Save name
          </Button>
        </form>
      </Card>

      <SectionLabel>App</SectionLabel>
      <Card>
        <Kv k="Installed" v={pwa.installed ? "Yes" : "No"} />
        <Kv k="Connection" v={pwa.online ? "Online" : "Offline"} />
        {pwa.canInstall && !pwa.installed && (
          <Button variant="primary" className="mt-3" onClick={pwa.install}>
            ⬇ Add to home screen
          </Button>
        )}
        {pwa.showIosHint && !pwa.installed && (
          <Note className="mt-3">
            On iPhone: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>. The app then opens full screen, straight on the project list.
          </Note>
        )}
      </Card>

      <SectionLabel>How it works</SectionLabel>
      <Note>
        Open a project and tap <b>New order</b> for each phase of work. An order moves through Project Plan, Kick Off, Schedule Posting, Deployment &amp; Execution, Site Walk / Handover,
        Transfer / Movement and Completion. In Deployment, allocate the day's manpower and tools; the <b>Manpower</b> and <b>Equipment</b> tabs show where everyone and everything is that day.
        Allocations belong to their day, so each morning starts empty. For the daily report, tap <b>New report</b> and save a draft before work starts. At the end of the day open it again, fill in ACTUAL for each activity, then submit. Submitted
        reports are read-only until someone reopens them. <b>Plan</b> holds the Monday whiteboard rows, and <b>Progress</b> is the Dashboard Report with its Excel export.
      </Note>
      <a href="/" className="sr-btn sr-btn-line mt-4">
        ← Back to Live Operations
      </a>
    </div>
  );
}
