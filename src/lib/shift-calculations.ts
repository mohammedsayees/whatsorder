function currencyAmount(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateExpectedCash(
  openingCash: number,
  completedCashOrders: number,
  cashPaidOuts: number
) {
  return currencyAmount(openingCash + completedCashOrders - cashPaidOuts);
}

export function calculateCashDifference(
  cashCounted: number,
  expectedCash: number
) {
  return currencyAmount(cashCounted - expectedCash);
}
