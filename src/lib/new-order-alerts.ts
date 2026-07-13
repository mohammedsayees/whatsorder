const defaultSeenOrderLimit = 500;

export function findUnseenOrderIds(
  currentOrderIds: readonly string[],
  seenOrderIds: ReadonlySet<string>
) {
  return [...new Set(currentOrderIds.filter(Boolean))].filter(
    (orderId) => !seenOrderIds.has(orderId)
  );
}

export function createInitialSeenOrderIds() {
  return new Set<string>();
}

export function rememberOrderIds(
  seenOrderIds: Set<string>,
  orderIds: readonly string[],
  limit = defaultSeenOrderLimit
) {
  for (const orderId of orderIds) {
    if (!orderId) {
      continue;
    }

    seenOrderIds.delete(orderId);
    seenOrderIds.add(orderId);
  }

  while (seenOrderIds.size > limit) {
    const oldestOrderId = seenOrderIds.values().next().value;

    if (!oldestOrderId) {
      break;
    }

    seenOrderIds.delete(oldestOrderId);
  }

  return seenOrderIds;
}
