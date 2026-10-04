export function createOrder(
  item: string,
  quantity: number,
): { item: string; quantity: number } {
  const normalizedItem = item.trim();

  if (!normalizedItem) {
    throw new Error("Item is required");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive integer");
  }

  return { item: normalizedItem, quantity };
}
