export type Order = { item: string; quantity: number };

export function createOrder(item: string, quantity: number): Order {
  if (!item.trim() || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error('An item and a positive integer quantity are required');
  }
  return { item: item.trim(), quantity };
}
