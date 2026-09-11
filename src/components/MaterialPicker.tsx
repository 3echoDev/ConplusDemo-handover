import { useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "@/data/AppDataContext";
import { resolveMaterial } from "@/lib/materialMatch";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  materialId: string | null;
  onChange: (next: { description: string; materialId: string | null }) => void;
  className?: string;
  placeholder?: string;
}

/** Free-text material input that links to a stock item when the name resolves. */
export default function MaterialPicker({ value, materialId, onChange, className, placeholder }: Props) {
  const { inventory } = useAppData();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => inventory.map((i) => ({ id: i.id, name: i.name, code: i.code, qty: i.totalQty, unit: i.unit })),
    [inventory],
  );
  const res = useMemo(() => resolveMaterial(value, items), [value, items]);
  const linked = materialId ? items.find((i) => i.id === materialId) ?? null : null;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handleText = (text: string) => {
    const r = resolveMaterial(text, items);
    onChange({ description: text, materialId: r.match ? r.match.id : null });
    setOpen(text.trim() !== "");
  };

  const pick = (item: (typeof items)[number]) => {
    onChange({ description: item.name, materialId: item.id });
    setOpen(false);
  };

  const suggestions = res.match ? [] : res.candidates;

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={cn(className, linked && "pr-16")}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleText(e.target.value)}
        onFocus={() => setOpen(value.trim() !== "" && !res.match)}
        aria-label="Material"
        autoComplete="off"
      />
      {linked && (
        <span
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success"
          title={`Linked to stock item ${linked.code} · ${linked.qty} ${linked.unit} on hand`}
        >
          linked
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-card py-1 text-sm shadow-lg"
        >
          {suggestions.map((s) => (
            <li
              key={s.id}
              role="option"
              aria-selected={false}
              className="cursor-pointer px-3 py-1.5 hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground"> · {s.qty} {s.unit} on hand</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
