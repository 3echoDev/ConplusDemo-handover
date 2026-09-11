// Resolves a free-text material name (e.g. pasted from Material_Inventory_Record)
// to a materials row. Erasable-syntax TypeScript only: the gate check imports this
// file directly under Node's type stripping.

export interface MaterialLike {
  id: string;
  name: string;
  code?: string | null;
}

export interface MaterialResolution<T extends MaterialLike> {
  match: T | null;
  candidates: T[];
}

export function normalizeMaterialName(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([-/])\s*/g, "$1");
}

export function compactMaterialName(s: string | null | undefined): string {
  return normalizeMaterialName(s).replace(/\s+/g, "");
}

// Separator-insensitive key: "BBOS-7001", "BBOS 7001" and "bbos7001" collapse together.
export function bareMaterialKey(s: string | null | undefined): string {
  return normalizeMaterialName(s).replace(/[^a-z0-9]+/g, "");
}

export function resolveMaterial<T extends MaterialLike>(
  name: string | null | undefined,
  materials: T[],
): MaterialResolution<T> {
  const norm = normalizeMaterialName(name);
  if (!norm) return { match: null, candidates: [] };

  const exact = materials.filter(
    (m) => normalizeMaterialName(m.name) === norm || (m.code && normalizeMaterialName(m.code) === norm),
  );
  if (exact.length === 1) return { match: exact[0], candidates: exact };
  if (exact.length > 1) return { match: null, candidates: exact.slice(0, 6) };

  const compact = compactMaterialName(name);
  const loose = materials.filter(
    (m) => compactMaterialName(m.name) === compact || (m.code && compactMaterialName(m.code) === compact),
  );
  if (loose.length === 1) return { match: loose[0], candidates: loose };
  if (loose.length > 1) return { match: null, candidates: loose.slice(0, 6) };

  const bare = bareMaterialKey(name);
  const bareHits = materials.filter(
    (m) => bareMaterialKey(m.name) === bare || (m.code && bareMaterialKey(m.code) === bare),
  );
  if (bareHits.length === 1) return { match: bareHits[0], candidates: bareHits };
  if (bareHits.length > 1) return { match: null, candidates: bareHits.slice(0, 6) };

  const scored = materials
    .map((m) => {
      const n = compactMaterialName(m.name);
      const c = m.code ? compactMaterialName(m.code) : "";
      let score = 0;
      if (n.startsWith(compact) || (c && c.startsWith(compact))) score = 2;
      else if (n.includes(compact) || (c && c.includes(compact))) score = 1;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.m.name.localeCompare(b.m.name))
    .slice(0, 6)
    .map((x) => x.m);
  return { match: null, candidates: scored };
}
