export function required<T>(
  value: T,
  message: string = "Required value is missing",
): NonNullable<T> {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
