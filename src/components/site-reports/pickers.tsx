// Project and material comboboxes for Site Reports. Both popovers scale from
// their trigger (Radix exposes the origin), not from the centre.
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FolderKanban, Package, Plus } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { inputCls } from "./primitives";

export interface SiteProject {
  id: string;
  project_code: string;
  name: string;
  client_name: string | null;
  location: string | null;
  coating_system: string | null;
  status: string;
}

export interface SiteMaterial {
  id: string;
  name: string;
  item_code: string | null;
  unit: string | null;
}

const popCls =
  "origin-[var(--radix-popover-content-transform-origin)] p-0 w-[var(--radix-popover-trigger-width)] min-w-[18rem] rounded-xl";

export function ProjectPicker({
  projects,
  value,
  onChange,
  loading,
}: {
  projects: SiteProject[];
  value: SiteProject | null;
  onChange: (p: SiteProject) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Select project"
          className={cn(inputCls, "flex h-12 cursor-pointer items-center gap-3 text-left")}
        >
          <FolderKanban className="h-5 w-5 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold tabular-nums">{value.project_code}</span>
              <span className="text-muted-foreground"> — {value.name}</span>
            </span>
          ) : (
            <span className="flex-1 text-muted-foreground">{loading ? "Loading projects…" : "Select a project…"}</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={popCls}>
        <Command>
          <CommandInput placeholder="Search code, project or client…" className="h-11 text-base" />
          <CommandList className="max-h-[min(60vh,22rem)]">
            <CommandEmpty>No active project matches.</CommandEmpty>
            <CommandGroup heading={`${projects.length} active projects`}>
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.project_code} ${p.name} ${p.client_name ?? ""}`}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className="cursor-pointer gap-3 py-2.5"
                >
                  <Check className={cn("h-4 w-4 shrink-0", value?.id === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      <span className="font-semibold tabular-nums">{p.project_code}</span> — {p.name}
                    </span>
                    {p.client_name && <span className="block truncate text-xs text-muted-foreground">{p.client_name}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Material: pick from the inventory master (keeps material_id, so ACTUAL can
 * post to Site stock later) or keep the name as typed — chat posts write
 * colour-coded names such as "WG100(7037)" that are not catalogue names.
 */
export function MaterialField({
  id,
  materials,
  value,
  materialId,
  onChange,
  disabled,
  describedBy,
}: {
  id: string;
  materials: SiteMaterial[];
  value: string;
  materialId: string | null;
  onChange: (name: string, id: string | null) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const linked = useMemo(() => (materialId ? materials.find((m) => m.id === materialId) : undefined), [materialId, materials]);
  const typed = search.trim();
  const exact = typed && materials.some((m) => m.name.toLowerCase() === typed.toLowerCase());

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSearch(value);
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-describedby={describedBy}
          className={cn(inputCls, "flex cursor-pointer items-center gap-2 text-left")}
        >
          <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground/70")}>{value || "Pick or type…"}</span>
          {linked && <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">STOCK</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={popCls}>
        <Command shouldFilter>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search name or item code…" className="h-11 text-base" />
          <CommandList className="max-h-[min(55vh,20rem)]">
            {/* forceMount on the group too: cmdk hides a group whose items it does not
                count as matches, and force-mounted items are never counted. */}
            {typed && !exact && (
              <CommandGroup forceMount>
                <CommandItem
                  value={`__typed__ ${typed}`}
                  forceMount
                  onSelect={() => {
                    onChange(typed, null);
                    setOpen(false);
                  }}
                  className="cursor-pointer gap-2 py-2.5"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Use “{typed}” as typed
                </CommandItem>
              </CommandGroup>
            )}
            <CommandEmpty>No stock item matches.</CommandEmpty>
            <CommandGroup heading="From stock">
              {materials.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.name} ${m.item_code ?? ""}`}
                  onSelect={() => {
                    onChange(m.name, m.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer gap-3 py-2"
                >
                  <Check className={cn("h-4 w-4 shrink-0", materialId === m.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{m.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[m.item_code, m.unit].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {value && (
              <CommandGroup forceMount>
                <CommandItem
                  value="__clear__"
                  forceMount
                  onSelect={() => {
                    onChange("", null);
                    setOpen(false);
                  }}
                  className="cursor-pointer py-2.5 text-muted-foreground"
                >
                  Clear material
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
