export function formatAmount(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

export function parseError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}
