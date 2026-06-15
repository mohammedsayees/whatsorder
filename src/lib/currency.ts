export function formatAED(value: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}
