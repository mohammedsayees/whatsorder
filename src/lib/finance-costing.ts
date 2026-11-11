export type CanonicalUnit = "g" | "ml" | "each";
export type PurchaseUnit = CanonicalUnit | "kg" | "l";

const UNIT_MULTIPLIER: Record<PurchaseUnit, number> = {
  each: 1,
  g: 1,
  kg: 1000,
  l: 1000,
  ml: 1
};

export function isCompatibleUnit(canonical: CanonicalUnit, purchase: PurchaseUnit) {
  return canonical === "g"
    ? purchase === "g" || purchase === "kg"
    : canonical === "ml"
      ? purchase === "ml" || purchase === "l"
      : purchase === "each";
}

export function normalizedUnitCostFils({
  canonicalUnit,
  packCount,
  packSize,
  packUnit,
  totalCostFils,
  yieldPct
}: {
  canonicalUnit: CanonicalUnit;
  packCount: number;
  packSize: number;
  packUnit: PurchaseUnit;
  totalCostFils: number;
  yieldPct: number;
}) {
  if (
    !isCompatibleUnit(canonicalUnit, packUnit) ||
    !Number.isFinite(packCount) || packCount <= 0 ||
    !Number.isFinite(packSize) || packSize <= 0 ||
    !Number.isSafeInteger(totalCostFils) || totalCostFils <= 0 ||
    !Number.isFinite(yieldPct) || yieldPct <= 0 || yieldPct > 100
  ) {
    throw new Error("Invalid purchase conversion.");
  }
  const usableUnits = packCount * packSize * UNIT_MULTIPLIER[packUnit] * yieldPct / 100;
  return totalCostFils / usableUnits;
}

export function recipeLineCostFils(
  canonicalQuantity: number,
  unitCostFils: number,
  wastePct = 0
) {
  if (
    !Number.isFinite(canonicalQuantity) || canonicalQuantity <= 0 ||
    !Number.isFinite(unitCostFils) || unitCostFils < 0 ||
    !Number.isFinite(wastePct) || wastePct < 0 || wastePct > 500
  ) {
    throw new Error("Invalid recipe cost input.");
  }
  return Math.round(canonicalQuantity * unitCostFils * (100 + wastePct) / 100);
}

export function allocateFils(totalFils: number, weights: number[]) {
  if (!Number.isSafeInteger(totalFils) || totalFils < 0) throw new Error("Invalid allocation total.");
  if (weights.length === 0 || weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("Invalid allocation weights.");
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) return weights.map(() => 0);
  const exact = weights.map((weight) => totalFils * weight / totalWeight);
  const allocated = exact.map(Math.floor);
  let remainder = totalFils - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ fraction: value - allocated[index], index }))
    .toSorted((first, second) => second.fraction - first.fraction || first.index - second.index);
  for (let index = 0; index < remainder; index += 1) allocated[order[index].index] += 1;
  return allocated;
}

export function splitVatInclusiveFils(totalFils: number, rateBps: number) {
  if (!Number.isSafeInteger(totalFils) || totalFils < 0) throw new Error("Invalid VAT total.");
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new Error("Invalid VAT rate.");
  const vatFils = Math.round(totalFils * rateBps / (10000 + rateBps));
  return { netFils: totalFils - vatFils, vatFils };
}

export function variableFeeFils(baseFils: number, rateBps: number) {
  if (!Number.isSafeInteger(baseFils) || baseFils < 0) throw new Error("Invalid fee base.");
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new Error("Invalid fee rate.");
  return Math.round(baseFils * rateBps / 10000);
}
