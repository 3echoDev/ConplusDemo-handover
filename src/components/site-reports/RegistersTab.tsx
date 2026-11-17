// Manpower and Equipment: the two registers, and where each person and tool
// is on the chosen day. People and tools are added once here and picked
// everywhere else. Location comes from that day's allocations only, so a new
// day shows everyone Unassigned and every tool In store until it is allocated.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtDay, isoDate } from "@/lib/siteReports";
import { DESIGNATIONS, nextToolNo, placesOn, placeText, usedDaysSinceService, type Allocation, type Place, type SiteOrder, type SiteTool, type SiteWorker } from "@/lib/siteOrders";
import { fetchAllocationsOn, fetchToolDays, saveTool, saveWorker } from "@/lib/siteOrdersApi";
import { notify } from "./notify";
import { Button, Card, CardHead, Chip, FabNew, Field, FieldRow, Kv, Note, NumberInput, Placeholder, Select, TextArea, TextInput } from "./primitives";

/** With the year: a service date is often more than a year old. */
const fullDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

interface Common {
  allOrders: SiteOrder[];
  onChanged: () => void;
  onOpenOrder: (p: Place) => void;
}

function useDay(date: string, bump: number) {
  const [allocs, setAllocs] = useState<Allocation[] | null>(null);
  useEffect(() => {
    setAllocs(null);
    fetchAllocationsOn(date).then(setAllocs);
  }, [date, bump]);
  return allocs;
}

function Filters({ date, setDate, q, setQ, placeholder, children }: { date: string; setDate: (d: string) => void; q: string; setQ: (s: string) => void; placeholder: string; children: React.ReactNode }) {
  return (
    <div className="sr-filters">
      <div className="sr-filters-row">
        <TextInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="!min-h-[36px] !py-2 !text-[12px] !font-semibold" />
        <TextInput type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day shown" className="!min-h-[36px] w-[42%] shrink-0 !py-2 !text-[12px] !font-semibold" />
      </div>
      <div className="sr-filters-row mt-2">{children}</div>
    </div>
  );
}

function Group({ title, count, extra, children, startOpen }: { title: string; count: number; extra?: string; children: React.ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(!!startOpen);
  return (
    <div className="mb-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="sr-card sr-card-tap !mb-0 flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 text-left">
          <span className="sr-name sr-name-sm block">{title}</span>
          {extra && <span className="sr-meta block">{extra}</span>}
        </span>
        <span className="sr-mono text-[12px] text-[var(--ink-muted)]">{count}</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="mt-2 pl-1">{children}</div>}
    </div>
  );
}

const PlaceLinks = ({ places, onOpen }: { places: Place[]; onOpen: (p: Place) => void }) => (
  <>
    {places.map((p) => (
      <button key={p.order_id} type="button" onClick={() => onOpen(p)} className="block w-full truncate text-left text-[12px] font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
        {placeText(p)}
        {p.attendance && p.attendance !== "Full Day" ? ` (${p.attendance})` : ""}
        {p.ot_hours ? ` +${p.ot_hours}h OT` : ""}
      </button>
    ))}
  </>
);

// ── Manpower ──────────────────────────────────────────────────────────────────

export function ManpowerTab({ workers, allOrders, onChanged, onOpenOrder }: Common & { workers: SiteWorker[] | null }) {
  const today = isoDate(new Date());
  const [date, setDate] = useState(today);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "on" | "free">("all");
  const [editing, setEditing] = useState<Partial<SiteWorker> | null>(null);
  const [bump, setBump] = useState(0);
  const allocs = useDay(date, bump);
  const where = useMemo(() => placesOn(allocs ?? [], allOrders, date, "worker"), [allocs, allOrders, date]);

  const needle = q.trim().toLowerCase();
  const list = (workers ?? []).filter(
    (w) => w.active && (!needle || `${w.name} ${w.emp_code ?? ""} ${w.designation}`.toLowerCase().includes(needle)) && (show === "all" || (show === "on") === where.has(w.id)),
  );
  const groups = useMemo(() => {
    const m = new Map<string, SiteWorker[]>();
    for (const w of list) m.set(w.designation, [...(m.get(w.designation) ?? []), w]);
    return [...m.entries()].sort((a, b) => {
      const ia = DESIGNATIONS.indexOf(a[0]);
      const ib = DESIGNATIONS.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, needle, show, where]);
  const active = (workers ?? []).filter((w) => w.active);
  const onSite = active.filter((w) => where.has(w.id)).length;

  return (
    <>
      <Filters date={date} setDate={setDate} q={q} setQ={setQ} placeholder="Search name, code or designation">
        <Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Filter by allocation">
          <option value="all">Everyone</option>
          <option value="on">Allocated</option>
          <option value="free">Unassigned</option>
        </Select>
      </Filters>
      <div className="sr-scroll">
        <FabNew onClick={() => setEditing({ designation: "General Worker" })}>＋ Add person</FabNew>
        {editing && (
          <WorkerForm
            row={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              setBump((b) => b + 1);
              onChanged();
            }}
          />
        )}
        {workers === null || allocs === null ? (
          [0, 1, 2].map((i) => <div key={i} className="sr-skeleton" />)
        ) : (
          <>
            <Note className="mb-3">
              {date === today ? "Today" : fmtDay(date)}: <b>{onSite}</b> allocated · <b>{active.length - onSite}</b> unassigned of {active.length}. Allocation is per day and starts empty each morning.
            </Note>
            {groups.length === 0 && <Placeholder icon="🔍" title="No one matches" />}
            {groups.map(([designation, people]) => (
              <Group key={`${designation}:${!!needle || show !== "all"}`} title={designation} count={people.length} extra={`${people.filter((w) => where.has(w.id)).length} allocated`} startOpen={!!needle || show !== "all" || groups.length === 1}>
                {people.map((w) => {
                  const places = where.get(w.id);
                  return (
                    <Card key={w.id}>
                      <CardHead
                        small
                        name={w.name}
                        meta={w.emp_code ? `Emp ${w.emp_code}` : "No employee code"}
                        right={
                          <>
                            {places ? <Chip tone="good">On site</Chip> : <Chip tone="pending">Unassigned</Chip>}
                            <button type="button" className="sr-iconbtn" aria-label={`Edit ${w.name}`} onClick={() => setEditing(w)}>
                              ✎
                            </button>
                          </>
                        }
                      />
                      {places && <PlaceLinks places={places} onOpen={onOpenOrder} />}
                    </Card>
                  );
                })}
              </Group>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function WorkerForm({ row, onClose, onSaved }: { row: Partial<SiteWorker>; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ emp_code: row.emp_code ?? "", name: row.name ?? "", designation: row.designation ?? "", contact: row.contact ?? "" });
  const [busy, setBusy] = useState(false);
  const save = async (active = true) => {
    if (!v.name.trim()) return notify.error("Enter the person's name");
    setBusy(true);
    const r = await saveWorker({ id: row.id, ...v, active });
    setBusy(false);
    if (!r.ok) return notify.error(r.error || "Could not save");
    notify.success(active ? `${v.name.trim()} saved` : `${v.name.trim()} removed from the roster`);
    onSaved();
  };
  const desigs = DESIGNATIONS.includes(v.designation) || !v.designation ? DESIGNATIONS : [v.designation, ...DESIGNATIONS];
  return (
    <Card className="!border-[var(--accent)]">
      <CardHead small name={row.id ? "Edit person" : "Add person"} />
      <Field label="Name">{(id) => <TextInput id={id} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="off" />}</Field>
      <FieldRow>
        <Field label="Employee code">{(id) => <TextInput id={id} value={v.emp_code} onChange={(e) => setV({ ...v, emp_code: e.target.value })} inputMode="numeric" />}</Field>
        <Field label="Designation">
          {(id) => (
            <Select id={id} value={v.designation} onChange={(e) => setV({ ...v, designation: e.target.value })}>
              {desigs.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          )}
        </Field>
      </FieldRow>
      <Field label="Contact">{(id) => <TextInput id={id} value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} inputMode="tel" />}</Field>
      <Button variant="primary" onClick={() => save()} disabled={busy}>
        Save
      </Button>
      <FieldRow className="mt-2">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {row.id && (
          <Button variant="danger" onClick={() => save(false)} disabled={busy}>
            Remove from roster
          </Button>
        )}
      </FieldRow>
    </Card>
  );
}

// ── Equipment ─────────────────────────────────────────────────────────────────

export function EquipmentTab({ tools, allOrders, onChanged, onOpenOrder }: Common & { tools: SiteTool[] | null }) {
  const today = isoDate(new Date());
  const [date, setDate] = useState(today);
  const [q, setQ] = useState("");
  const [cond, setCond] = useState<"all" | "good" | "spoiled">("all");
  const [loc, setLoc] = useState<"all" | "site" | "store">("all");
  const [editing, setEditing] = useState<Partial<SiteTool> | null>(null);
  const [bump, setBump] = useState(0);
  const [toolDays, setToolDays] = useState<Pick<Allocation, "tool_id" | "work_date">[]>([]);
  const allocs = useDay(date, bump);
  const where = useMemo(() => placesOn(allocs ?? [], allOrders, date, "tool"), [allocs, allOrders, date]);
  const reload = useCallback(() => fetchToolDays().then(setToolDays), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const active = (tools ?? []).filter((t) => t.active);
  const needle = q.trim().toLowerCase();
  const list = active.filter(
    (t) =>
      (!needle || `${t.tool_no} ${t.item} ${t.category}`.toLowerCase().includes(needle)) &&
      (cond === "all" || t.condition === cond) &&
      (loc === "all" || (loc === "site") === where.has(t.id)),
  );
  const groups = useMemo(() => {
    const m = new Map<string, SiteTool[]>();
    for (const t of list) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools, needle, cond, loc, where]);
  const onSite = active.filter((t) => where.has(t.id)).length;
  const spoiled = active.filter((t) => t.condition === "spoiled").length;
  const filtering = !!needle || cond !== "all" || loc !== "all";

  return (
    <>
      <Filters date={date} setDate={setDate} q={q} setQ={setQ} placeholder="Search tool number or item">
        <Select value={cond} onChange={(e) => setCond(e.target.value as typeof cond)} aria-label="Filter by condition">
          <option value="all">All conditions</option>
          <option value="good">Good</option>
          <option value="spoiled">Spoiled</option>
        </Select>
        <Select value={loc} onChange={(e) => setLoc(e.target.value as typeof loc)} aria-label="Filter by location">
          <option value="all">Everywhere</option>
          <option value="site">On site</option>
          <option value="store">In store</option>
        </Select>
      </Filters>
      <div className="sr-scroll">
        <FabNew onClick={() => setEditing({ condition: "good" })}>＋ Add tool</FabNew>
        {editing && (
          <ToolForm
            row={editing}
            tools={tools ?? []}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              setBump((b) => b + 1);
              onChanged();
            }}
          />
        )}
        {tools === null || allocs === null ? (
          [0, 1, 2].map((i) => <div key={i} className="sr-skeleton" />)
        ) : (
          <>
            <Note className="mb-3">
              {date === today ? "Today" : fmtDay(date)}: <b>{onSite}</b> on site · <b>{active.length - onSite - spoiled}</b> in store · <b>{spoiled}</b> spoiled, of {active.length} tools. A tool is on site only on
              the days it is allocated.
            </Note>
            {groups.length === 0 && <Placeholder icon="🔍" title="No tool matches" />}
            {groups.map(([category, items]) => (
              <Group key={`${category}:${filtering}`} title={category} count={items.length} extra={`${items.filter((t) => where.has(t.id)).length} on site`} startOpen={filtering || groups.length === 1}>
                {items.map((t) => {
                  const places = where.get(t.id);
                  return (
                    <Card key={t.id}>
                      <CardHead
                        small
                        name={t.item}
                        meta={<span className="sr-mono">{t.tool_no}</span>}
                        right={
                          <>
                            {t.condition === "spoiled" ? <Chip tone="bad">Spoiled</Chip> : places ? <Chip tone="good">On site</Chip> : <Chip tone="pending">In store</Chip>}
                            <button type="button" className="sr-iconbtn" aria-label={`Edit ${t.tool_no}`} onClick={() => setEditing(t)}>
                              ✎
                            </button>
                          </>
                        }
                      />
                      {places && <PlaceLinks places={places} onOpen={onOpenOrder} />}
                      <Kv k="Last service" v={t.last_service ? fullDate(t.last_service) : "—"} />
                      <Kv k="Used days since service" v={usedDaysSinceService(toolDays, t.id, t.last_service)} />
                      {t.efficiency_m2_day != null && <Kv k="Efficiency" v={`${t.efficiency_m2_day} m²/day`} />}
                      {t.remarks && <Note className="mt-2">{t.remarks}</Note>}
                    </Card>
                  );
                })}
              </Group>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function ToolForm({ row, tools, onClose, onSaved }: { row: Partial<SiteTool>; tools: SiteTool[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    tool_no: row.tool_no ?? "",
    item: row.item ?? "",
    category: row.category ?? "",
    code: row.code ?? "",
    purchase_date: row.purchase_date ?? "",
    last_service: row.last_service ?? "",
    efficiency_m2_day: row.efficiency_m2_day == null ? "" : String(row.efficiency_m2_day),
    condition: row.condition ?? "good",
    remarks: row.remarks ?? "",
  });
  const [busy, setBusy] = useState(false);
  const cats = useMemo(() => [...new Set(tools.map((t) => t.category))].sort(), [tools]);
  const items = useMemo(() => [...new Set(tools.map((t) => t.item))].sort(), [tools]);

  // Picking an item already in the register fills in its category, code and the next free number.
  const setItem = (item: string) => {
    const like = !row.id ? tools.find((t) => t.item.toLowerCase() === item.trim().toLowerCase()) : undefined;
    if (!like) return setV((s) => ({ ...s, item }));
    const prefix = like.tool_no.replace(/-\d+$/, "");
    setV((s) => ({
      ...s,
      item,
      category: like.category,
      code: like.code ?? "",
      efficiency_m2_day: like.efficiency_m2_day == null ? s.efficiency_m2_day : String(like.efficiency_m2_day),
      tool_no: nextToolNo(
        tools.map((t) => t.tool_no),
        prefix,
      ),
    }));
  };

  const save = async (active = true) => {
    if (!v.item.trim() || !v.tool_no.trim() || !v.category.trim()) return notify.error("Item, tool number and category are required");
    setBusy(true);
    const r = await saveTool({ id: row.id, ...v, active } as unknown as Partial<SiteTool>);
    setBusy(false);
    if (!r.ok) return notify.error(r.error || "Could not save");
    notify.success(active ? `${v.tool_no.trim().toUpperCase()} saved` : `${v.tool_no} removed from the register`);
    onSaved();
  };

  return (
    <Card className="!border-[var(--accent)]">
      <CardHead small name={row.id ? "Edit tool" : "Add tool"} />
      <datalist id="sr-tool-items">
        {items.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <datalist id="sr-tool-cats">
        {cats.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field label="Item" hint={row.id ? undefined : "Pick an item already in the register to get the next tool number."}>
        {(id, d) => <TextInput id={id} aria-describedby={d} list="sr-tool-items" value={v.item} onChange={(e) => setItem(e.target.value)} autoComplete="off" />}
      </Field>
      <FieldRow>
        <Field label="Tool number">{(id) => <TextInput id={id} value={v.tool_no} onChange={(e) => setV({ ...v, tool_no: e.target.value })} placeholder="CP-XXX-01" autoCapitalize="characters" />}</Field>
        <Field label="Category">{(id) => <TextInput id={id} list="sr-tool-cats" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />}</Field>
      </FieldRow>
      <FieldRow>
        <Field label="Purchase date">{(id) => <TextInput id={id} type="date" value={v.purchase_date} onChange={(e) => setV({ ...v, purchase_date: e.target.value })} />}</Field>
        <Field label="Last service">{(id) => <TextInput id={id} type="date" value={v.last_service} onChange={(e) => setV({ ...v, last_service: e.target.value })} />}</Field>
      </FieldRow>
      <FieldRow>
        <Field label="Condition">
          {(id) => (
            <Select id={id} value={v.condition} onChange={(e) => setV({ ...v, condition: e.target.value as SiteTool["condition"] })}>
              <option value="good">Good</option>
              <option value="spoiled">Spoiled</option>
            </Select>
          )}
        </Field>
        <Field label="Efficiency (m²/day)">{(id) => <NumberInput id={id} value={v.efficiency_m2_day} onChange={(e) => setV({ ...v, efficiency_m2_day: e.target.value })} />}</Field>
      </FieldRow>
      <Field label="Remarks">{(id) => <TextArea id={id} rows={2} value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} />}</Field>
      <Button variant="primary" onClick={() => save()} disabled={busy}>
        Save
      </Button>
      <FieldRow className="mt-2">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {row.id && (
          <Button variant="danger" onClick={() => save(false)} disabled={busy}>
            Remove from register
          </Button>
        )}
      </FieldRow>
    </Card>
  );
}
