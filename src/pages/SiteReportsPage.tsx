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
    -> project: Reports list (cards with the stage rail) | Plan | Progress, navbar
       -> a report: the edit screen with the stacked button row, no navbar
    Settings: reporter name, install, help.
  Installable (manifest + service worker, see lib/sitePwa.ts). The URL carries
  ?project=&tab=&date=&week=&report= so a link opens the same view.
*/

type Tab = "projects" | "reports" | "daily" | "plan" | "progress" | "settings";
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

const NAV: { id: Tab; icon: string; label: string; needsProject?: boolean }[] = [
  { id: "projects", icon: "🗂️", label: "Projects" },
  { id: "reports", icon: "📝", label: "Reports", needsProject: true },
  { id: "plan", icon: "📅", label: "Plan", needsProject: true },
  { id: "progress", icon: "📊", label: "Progress", needsProject: true },
  { id: "settings", icon: "⚙️", label: "Settings" },
];

function readTab(raw: string | null, hasProject: boolean): Tab {
  if (raw === "dashboard") return "progress";
  if (raw && ["projects", "reports", "daily", "plan", "progress", "settings"].includes(raw)) {
    const t = raw as Tab;
    return hasProject || t === "projects" || t === "settings" ? t : "projects";
  }
  return hasProject ? "reports" : "projects";
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
  const pwa = useSitePwa();

  const today = isoDate(new Date());
  const code = params.get("project") || readLastProject();
  const project = useMemo(() => projects.find((p) => p.project_code === code) ?? null, [projects, code]);
  const tab = readTab(params.get("tab"), !!code);
  const date = params.get("date") || today;
  const week = weekStart(params.get("week") || date);
  const reportParam = params.get("report"); // "new", an id, or null (that day's first report)

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

  const go = (t: Tab) => guardNav(() => patch({ tab: t, report: null, date: null }));
  const openProject = (p: SiteProject) =>
    guardNav(() => patch({ project: p.project_code, tab: "reports", date: null, week: null, report: null }));
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
                    : `${projects.length} active projects · ${Object.values(todayStatus).filter((s) => s === "submitted").length} submitted today · ${Object.values(todayStatus).filter((s) => s === "draft").length} in draft · chips show today's report`}
                </div>
              }
            />
            <ProjectsScreen projects={projects} loading={loadingProjects} todayStatus={todayStatus} onOpen={openProject} pwa={pwa} offline={offline} />
            <NavBar tab={tab} hasProject={!!project} go={go} />
          </>
        )}

        {/* ── Project: Reports list ── */}
        {tab === "reports" && project && (
          <>
            <TopBar back onBack={() => go("projects")} title={project.name} sub={projectSub} />
            <div className="sr-scroll">
              {offline}
              <FabNew onClick={() => openReport(today, "new")}>＋ New report</FabNew>
              <ReportsList recent={recent} today={today} onOpen={(r) => openReport(r.report_date, r.id)} />
            </div>
            <NavBar tab={tab} hasProject={!!project} go={go} />
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
            <TopBar back onBack={() => go("projects")} title={project.name} sub={projectSub} />
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
            <NavBar tab={tab} hasProject={!!project} go={go} />
          </>
        )}

        {/* ── Project: Progress (the Dashboard Report) ── */}
        {tab === "progress" && project && (
          <>
            <TopBar back onBack={() => go("projects")} title={project.name} sub={projectSub} />
            <div className="sr-scroll">
              {offline}
              <DashboardTab key={project.id} project={project} lastWo={lastWo} refreshKey={refreshKey} onOpenDay={(d) => openReport(d, null)} />
            </div>
            <NavBar tab={tab} hasProject={!!project} go={go} />
          </>
        )}

        {/* A project tab with the project still loading, or a code that no longer exists. */}
        {tab !== "projects" && tab !== "settings" && !project && (
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
            <NavBar tab={tab} hasProject={false} go={go} />
          </>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <>
            <TopBar title="Settings" sub="Account, app & help" />
            <SettingsScreen pwa={pwa} offline={offline} />
            <NavBar tab={tab} hasProject={!!project} go={go} />
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

function NavBar({ tab, hasProject, go }: { tab: Tab; hasProject: boolean; go: (t: Tab) => void }) {
  return (
    <nav className="sr-navbar sticky bottom-0 z-40" aria-label="Site Reports sections">
      {NAV.map((n) => {
        const active = tab === n.id || (tab === "daily" && n.id === "reports");
        return (
          <button
            key={n.id}
            type="button"
            className={cn("sr-navitem", active && "active")}
            aria-current={active ? "page" : undefined}
            disabled={n.needsProject && !hasProject}
            onClick={() => go(n.id)}
          >
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
  loading,
  todayStatus,
  onOpen,
  pwa,
  offline,
}: {
  projects: SiteProject[];
  loading: boolean;
  todayStatus: Record<string, DayStatus>;
  onOpen: (p: SiteProject) => void;
  pwa: ReturnType<typeof useSitePwa>;
  offline: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "reported" | "missing">("all");
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    let l = projects;
    if (needle) l = l.filter((p) => `${p.project_code} ${p.name} ${p.client_name ?? ""} ${p.location ?? ""}`.toLowerCase().includes(needle));
    if (filter === "reported") l = l.filter((p) => todayStatus[p.id]);
    if (filter === "missing") l = l.filter((p) => !todayStatus[p.id]);
    return l;
  }, [projects, needle, filter, todayStatus]);

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
            {filter === "reported" ? "No report has been started for today yet." : filter === "missing" ? "Every project has a report today." : "Search by project code, name, client or site."}
          </Placeholder>
        ) : (
          list.map((p) => {
            const st = todayStatus[p.id];
            return (
              <Card key={p.id} onClick={() => onOpen(p)}>
                <CardHead
                  name={p.name}
                  meta={[p.project_code, p.client_name].filter(Boolean).join(" · ")}
                  right={
                    st === "submitted" ? <Chip tone="good">Submitted</Chip> : st === "draft" ? <Chip tone="warn">Draft</Chip> : <Chip tone="pending">No report</Chip>
                  }
                />
                <Note>{[p.location, p.coating_system].filter(Boolean).join(" · ") || "No site or coating system on file."}</Note>
              </Card>
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
        Pick a project, tap <b>New report</b> and save a draft before work starts. At the end of the day open it again, fill in ACTUAL for each activity, then submit. Submitted
        reports are read-only until someone reopens them. <b>Plan</b> holds the Monday whiteboard rows, and <b>Progress</b> is the Dashboard Report with its Excel export.
      </Note>
      <a href="/" className="sr-btn sr-btn-line mt-4">
        ← Back to Live Operations
      </a>
    </div>
  );
}
