import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { resolveMaterial, normalizeMaterialName } from "@/lib/materialMatch";
import MaterialPicker from "@/components/MaterialPicker";

const ITEMS = [
  { id: "m1", code: "BBOS-1001", name: "BBOS-1001", totalQty: 4, unit: "pails" },
  { id: "m2", code: "BBOS-7026", name: "BBOS-7026", totalQty: 1, unit: "pails" },
  { id: "m3", code: "FlowcreteMF/RT/HF-Yellow", name: "FlowcreteMF/RT/HF-Yellow", totalQty: 10, unit: "pails" },
  { id: "m4", code: "BBOS 7001", name: "BBOS 7001", totalQty: 0, unit: "Kgs" },
];

vi.mock("@/data/AppDataContext", () => ({
  useAppData: () => ({ inventory: ITEMS }),
}));

describe("resolveMaterial", () => {
  it("normalises spacing and case", () => {
    expect(normalizeMaterialName("  Flowcrete MF / RT/HF - Yellow ")).toBe("flowcrete mf/rt/hf-yellow");
  });
  it("resolves a spaced xlsx name to the compact DB name", () => {
    expect(resolveMaterial("Flowcrete MF/RT/HF-Yellow", ITEMS).match?.id).toBe("m3");
  });
  it("resolves an exact name", () => {
    expect(resolveMaterial("BBOS 7001", ITEMS).match?.id).toBe("m4");
  });
  it("does not cross-match a sibling RAL code", () => {
    const r = resolveMaterial("BBOS-7001", ITEMS);
    expect(r.match?.id).toBe("m4");
    expect(r.match?.id).not.toBe("m2");
  });
  it("returns candidates, not a match, for a partial", () => {
    const r = resolveMaterial("BBOS", ITEMS);
    expect(r.match).toBeNull();
    expect(r.candidates.length).toBeGreaterThan(1);
  });
});

// Stateful harness: the picker is controlled, like a WO line in CreateWODialog.
function Harness({ onChange, initial = { description: "", materialId: null as string | null } }: {
  onChange: (v: { description: string; materialId: string | null }) => void;
  initial?: { description: string; materialId: string | null };
}) {
  const [v, setV] = useState(initial);
  return (
    <MaterialPicker
      value={v.description}
      materialId={v.materialId}
      onChange={(next) => { setV(next); onChange(next); }}
    />
  );
}

describe("MaterialPicker", () => {
  it("links the picked stock item", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByLabelText("Material");
    fireEvent.change(input, { target: { value: "BBOS-10" } });
    expect(onChange).toHaveBeenLastCalledWith({ description: "BBOS-10", materialId: null });
    fireEvent.click(screen.getByText("BBOS-1001"));
    expect(onChange).toHaveBeenLastCalledWith({ description: "BBOS-1001", materialId: "m1" });
    expect(screen.getByText("linked")).toBeInTheDocument();
  });
  it("auto-links an exact name and shows the tag", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Material"), { target: { value: "BBOS-1001" } });
    expect(onChange).toHaveBeenLastCalledWith({ description: "BBOS-1001", materialId: "m1" });
    expect(screen.getByText("linked")).toBeInTheDocument();
  });
  it("unlinks on a non-matching name", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={{ description: "BBOS-1001", materialId: "m1" }} />);
    fireEvent.change(screen.getByLabelText("Material"), { target: { value: "zzz" } });
    expect(onChange).toHaveBeenLastCalledWith({ description: "zzz", materialId: null });
    expect(screen.queryByText("linked")).toBeNull();
  });
});
