import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarRange, ChevronRight, ClipboardCheck, Download, FolderKanban, HardHat, LayoutGrid, Search, Share, UserRound, WifiOff, X } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { isoDate, weekStart } from "@/lib/siteReports";
import { fetchLastWo, fetchMaterials, fetchProjects, reporterName, setReporterName } from "@/lib/siteReportsApi";
import { useSitePwa } from "@/lib/sitePwa";
import DailyReportTab from "@/components/site-reports/DailyReportTab";
import WeeklyPlanTab from "@/components/site-reports/WeeklyPlanTab";
import DashboardTab from "@/components/site-reports/DashboardTab";
import { type SiteMaterial, type SiteProject } from "@/components/site-reports/pickers";
import { Button, IconButton, Pill, SectionLabel, TextInput, inputCls, pressCls } from "@/components/site-reports/primitives";
import "@/components/site-reports/theme.css";

/*
  ConPlus — Site Reports
  ----------------------
  Lynn's project planning & tracking workflow (18 Sep, R1 25 Sep) in one tab:
    Daily report  — DAILY WORK REPORT + DAILY MATERIAL REPORT (planned / actual / defect),
                    Save draft before work -> finish ACTUAL at the end of the day -> Submit
    Weekly plan   — the Monday whiteboard as rows
    Dashboard     — the per-project Dashboard Report sheet, with Excel export
  Shaped like the client's SitePulse mockup (Oct 2026): a phone-first app with
  a top bar, a home screen of project cards, and a bottom navigation. It is
  installable (manifest + service worker, see lib/sitePwa.ts). The PM / PC
  picks the project once; everything below follows it. The URL carries
  ?project=&tab=&date=&week= so a link opens the same view.
*/

type Tab = "daily" | "plan" | "dashboard";
const TABS: { id: Tab; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "daily", label: "Daily", Icon: ClipboardCheck },
  { id: "plan", label: "Plan", Icon: CalendarRange },
  { id: "dashboard", label: "Dashboard", Icon: LayoutGrid },
];
const LAST_PROJECT_KEY = "conplus_site_reports_project";

const readLastProject = () => {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) || "";
  } catch {
    return "";
  }
};

type DayStatus = "draft" | "submitted";

/**
 * embedded: rendered inside the v1 AppLayout, whose <main> scrolls with 24px
 * padding. The page bleeds over it (-m-6) and the top bar pins at -1.5rem so
 * it sits flush with the pane's top. The bottom nav is sticky to the same
 * scroll container in both builds.
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
  const [home, setHome] = useState(false);
  const [todayStatus, setTodayStatus] = useState<Record<string, DayStatus>>({});
  const pwa = useSitePwa();

  const today = isoDate(new Date());
  const tab = (["daily", "plan", "dashboard"].includes(params.get("tab") ?? "") ? params.get("tab") : "daily") as Tab;
  const date = params.get("date") || today;
  const week = weekStart(params.get("week") || date);
  const code = home ? "" : params.get("project") || readLastProject();
  const project = useMemo(() => projects.find((p) => p.project_code === code) ?? null, [projects, code]);

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

  // Today's report per project, for the status chip on the home screen.
  useEffect(() => {
    if (project) return;
    (async () => {
      const { data } = await supabase.from("site_daily_reports").select("project_id,status").eq("report_date", today);
      const m: Record<string, DayStatus> = {};
      for (const r of (data as { project_id: string; status: string }[]) ?? []) {
        if (r.status === "submitted" || m[r.project_id] !== "submitted") m[r.project_id] = r.status === "submitted" ? "submitted" : "draft";
      }
      setTodayStatus(m);
    })();
  }, [project, today, refreshKey]);

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

  const openProject = (p: SiteProject) => {
    setHome(false);
    if (p.project_code !== project?.project_code) patch({ project: p.project_code, tab: null, date: null, week: null });
  };
  const goHome = () => guardNav(() => setHome(true));

  const wide = !!project && tab === "dashboard";

  return (
    <div className={cn("sr-app flex flex-col bg-background text-foreground", embedded ? "-m-6 min-h-[calc(100%+3rem)]" : "min-h-screen")}>
      {/* Top bar */}
      <header className={cn("sr-topbar sticky z-40 border-b border-border bg-card", embedded ? "-top-6" : "top-0")}>
        <div className={cn("mx-auto flex items-center gap-3 px-4 py-3", wide ? "max-w-7xl" : "max-w-md sm:max-w-lg")}>
          {project ? (
            <IconButton onClick={goHome} aria-label="All projects">
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
          ) : (
            <a
              href="/"
              onClick={(e) => {
                if (!dailyDirty) return;
                e.preventDefault();
                setPendingNav(() => () => (window.location.href = "/"));
              }}
              className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-border bg-secondary text-foreground hover:bg-card", pressCls)}
              aria-label="Back to Live Operations"
            >
              <ArrowLeft className="h-4 w-4" />
            </a>
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-heading text-[22px] font-bold tracking-[0.01em] text-foreground">
              {project ? (
                <>
                  <span className="sr-mono text-[17px] font-medium text-muted-foreground">{project.project_code}</span> {project.name}
                </>
              ) : (
                "Site Reports"
              )}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {project
                ? [project.client_name, project.location, project.coating_system].filter(Boolean).join(" · ") + (lastWo ? ` · WO ${lastWo}` : "")
                : "Site progress, in one place."}
            </p>
          </div>
          <ReporterChip />
        </div>
      </header>

      <main className={cn("mx-auto w-full flex-1 space-y-4 px-4 py-4", wide ? "max-w-7xl" : "max-w-md sm:max-w-lg", project && "pb-[calc(var(--sr-nav-h)+1rem)]")}>
        {!pwa.online && (
          <div role="status" className="flex items-start gap-2.5 rounded-[11px] bg-warning/15 px-3 py-2.5 text-xs leading-snug text-warning">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="font-medium">You are offline. Reports cannot be saved or submitted until the connection is back.</span>
          </div>
        )}

        {!project && (
          <HomeScreen
            projects={projects}
            loading={loadingProjects}
            todayStatus={todayStatus}
            onOpen={(p) => guardNav(() => openProject(p))}
            install={pwa}
          />
        )}

        {project && (
          <>
            {/* Panels stay mounted so an unsaved report survives a look at the dashboard. */}
            <div id="sr-panel-daily" role="tabpanel" aria-labelledby="sr-tab-daily" hidden={tab !== "daily"}>
              <DailyReportTab
                key={project.id}
                project={project}
                materials={materials}
                date={date}
                onDateChange={(d) => patch({ date: d === today ? null : d })}
                onChanged={changed}
                onDirtyChange={setDailyDirty}
                resetSignal={resetSignal}
                locationHints={locationHints}
              />
            </div>
            <div id="sr-panel-plan" role="tabpanel" aria-labelledby="sr-tab-plan" hidden={tab !== "plan"}>
              <WeeklyPlanTab
                key={project.id}
                project={project}
                week={week}
                onWeekChange={(w) => patch({ week: w === weekStart(today) ? null : w })}
                onChanged={changed}
                locationHints={locationHints}
              />
            </div>
            <div id="sr-panel-dashboard" role="tabpanel" aria-labelledby="sr-tab-dashboard" hidden={tab !== "dashboard"}>
              <DashboardTab
                key={project.id}
                project={project}
                lastWo={lastWo}
                refreshKey={refreshKey}
                onOpenDay={(d) => guardNav(() => patch({ tab: "daily", date: d === today ? null : d }))}
              />
            </div>
          </>
        )}
      </main>

      {/* Bottom navigation (the mockup's navbar) */}
      {project && (
        <nav
          role="tablist"
          aria-label="Site Reports sections"
          className="sticky bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)]"
        >
          <div className={cn("mx-auto flex", wide ? "max-w-7xl" : "max-w-md sm:max-w-lg")}>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                id={`sr-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`sr-panel-${id}`}
                onClick={() => patch({ tab: id })}
                className={cn(
                  "flex h-[58px] flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors duration-150",
                  tab === id ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={tab === id ? 2.4 : 2} />
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={goHome}
              className="flex h-[58px] flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <FolderKanban className="h-5 w-5" />
              Projects
            </button>
          </div>
        </nav>
      )}

      <AlertDialog open={pendingNav !== null} onOpenChange={(o) => !o && setPendingNav(null)}>
        <AlertDialogContent className="sr-app max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">Discard the unsaved daily report?</AlertDialogTitle>
            <AlertDialogDescription>The open daily report has edits that are not saved. Go back to it and save the draft to keep them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl" onClick={() => patch({ tab: "daily" })}>
              Back to the report
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl"
              onClick={() => {
                const a = pendingNav;
                setPendingNav(null);
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

/** Home: the mockup's "Active Projects" list as cards, with today's report status. */
function HomeScreen({
  projects,
  loading,
  todayStatus,
  onOpen,
  install,
}: {
  projects: SiteProject[];
  loading: boolean;
  todayStatus: Record<string, DayStatus>;
  onOpen: (p: SiteProject) => void;
  install: ReturnType<typeof useSitePwa>;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "today">("all");
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    let l = projects;
    if (needle) l = l.filter((p) => `${p.project_code} ${p.name} ${p.client_name ?? ""} ${p.location ?? ""}`.toLowerCase().includes(needle));
    if (filter === "today") l = l.filter((p) => todayStatus[p.id]);
    return l;
  }, [projects, needle, filter, todayStatus]);
  const reported = projects.filter((p) => todayStatus[p.id]).length;

  return (
    <div className="space-y-4">
      {!install.dismissed && (install.canInstall || install.showIosHint) && (
        <div className="flex items-start gap-3 rounded-[14px] border border-border bg-card p-3.5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
            <HardHat className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Add Site Reports to your home screen</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {install.canInstall ? (
                "Opens full screen like an app, straight to this page."
              ) : (
                <>
                  Tap <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-label="Share" /> in Safari, then <span className="font-semibold text-foreground">Add to Home Screen</span>.
                </>
              )}
            </p>
            {install.canInstall && (
              <Button variant="primary" className="mt-2.5 h-10 w-full" onClick={install.install}>
                <Download className="h-4 w-4" /> Install
              </Button>
            )}
          </div>
          <button type="button" onClick={install.dismiss} className="-m-1 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <TextInput
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search code, project, client or site…"
          aria-label="Search projects"
          className="h-12 pl-9"
        />
      </div>

      <div className="flex gap-2" role="group" aria-label="Filter projects">
        {(
          [
            ["all", `All · ${projects.length}`],
            ["today", `Reported today · ${reported}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              "h-9 flex-1 rounded-[10px] border px-3 text-[13px] font-semibold",
              pressCls,
              filter === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <SectionLabel>Active projects</SectionLabel>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading projects">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-[14px] border border-border bg-card" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-border bg-card px-6 py-12 text-center">
          <HardHat className="mx-auto h-9 w-9 text-muted-foreground/60" />
          <p className="mt-3 font-heading text-xl font-bold">No project matches</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            {filter === "today" ? "No report has been started for today yet." : "Search by project code, name, client or site."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => {
            const st = todayStatus[p.id];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen(p)}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 rounded-[14px] border border-border bg-card px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(33,29,25,0.06),0_6px_16px_-8px_rgba(33,29,25,0.18)]",
                    "hover:bg-secondary/60 active:bg-secondary",
                    pressCls,
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-[19px] font-bold leading-[1.1] text-foreground">{p.name}</p>
                    <p className="sr-mono mt-1 truncate text-[11.5px] text-muted-foreground">
                      {[p.project_code, p.client_name, p.location].filter(Boolean).join(" · ")}
                    </p>
                    {p.coating_system && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{p.coating_system}</p>}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {st === "submitted" ? (
                        <Pill tone="submitted">Submitted today</Pill>
                      ) : st === "draft" ? (
                        <Pill tone="draft">Draft today</Pill>
                      ) : (
                        <Pill tone="neutral">No report today</Pill>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "Reporting as …" — the name stamped on saves and submissions (no logins in this app). */
function ReporterChip() {
  const [name, setName] = useState(reporterName());
  const [draft, setDraft] = useState(name);
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(name);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "ml-auto inline-flex h-10 max-w-[9rem] cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-secondary px-2.5 text-sm text-foreground hover:bg-card",
            pressCls,
          )}
          aria-label={name ? `Reporting as ${name}. Change name` : "Set your name"}
        >
          <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn("hidden truncate min-[400px]:inline", !name && "text-muted-foreground")}>{name || "Your name"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="sr-app w-72 origin-[var(--radix-popover-content-transform-origin)] rounded-xl">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setReporterName(draft);
            setName(draft.trim());
            setOpen(false);
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="sr-reporter" className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Reporting as
            </label>
            <TextInput id="sr-reporter" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="name" placeholder="e.g. Lynn" autoFocus className={inputCls} />
            <p className="text-xs text-muted-foreground">Saved on this device and stamped on every save and submission.</p>
          </div>
          <Button variant="primary" type="submit" className="w-full">
            Save name
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
