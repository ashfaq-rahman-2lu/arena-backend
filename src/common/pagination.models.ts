export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export function paginate<T>(items: T[], page: number, limit: number): Page<T> {
  return {
    items: items.slice((page - 1) * limit, page * limit),
    total: items.length,
    page,
    limit,
  };
}
