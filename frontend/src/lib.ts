export const money = (value?: number | null) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(
    Number(value || 0)
  );

export const shortDate = (value?: string) => (value ? new Intl.DateTimeFormat("es-ES").format(new Date(value)) : "—");

export const shortDateTime = (value?: string) =>
  value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

export function slug(value: string) {
  return String(value || "").toLowerCase().trim();
}

export function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function fieldContains(row: object, term: string) {
  const haystack = normalizeText(JSON.stringify(row));
  return haystack.includes(normalizeText(term));
}

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total ? (safePage - 1) * pageSize : 0;
  const end = Math.min(total, start + pageSize);
  return { rows: rows.slice(start, end), total, totalPages, page: safePage, start, end };
}
