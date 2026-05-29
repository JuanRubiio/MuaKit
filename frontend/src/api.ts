import type {
  AuditRow,
  CostDetail,
  CostRow,
  DashboardFinance,
  IncomeSummary,
  Invoice,
  InvoiceDetail,
  KitRecipe,
  Material,
  Payout,
  Settings,
  ShopifyConnection,
  Summary,
  Supplier,
  SystemHealth
} from "./types";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeDashboardFinance(raw: any): DashboardFinance {
  const operational = raw?.operational ?? {};
  const income = raw?.income ?? {};
  const trend = raw?.trend ?? {};
  const monthlyBreakdown = raw?.monthly_breakdown ?? {};
  const trendKeys = asArray<string>(trend?.keys);
  const monthlyKeys = asArray<string>(monthlyBreakdown?.keys);
  const monthlyMonths = asArray<string>(monthlyBreakdown?.months);
  const series =
    trend?.series && typeof trend.series === "object"
      ? trend.series
      : monthlyBreakdown?.series && typeof monthlyBreakdown.series === "object"
        ? monthlyBreakdown.series
        : {};

  return {
    window: {
      from: raw?.window?.from || "",
      to: raw?.window?.to || "",
      granularity: trend?.mode === "day" || raw?.granularity === "day" ? "day" : "month"
    },
    kpis: {
      ...(raw?.kpis ?? {}),
      pending_payouts:
        raw?.kpis?.pending_payouts ??
        raw?.kpis?.pending_payout_count ??
        income?.pending_count ??
        asArray(operational?.pending_payouts).length
    },
    monthly_breakdown: {
      mode: trend?.mode === "day" || trend?.mode === "month" ? trend.mode : "month",
      keys: trendKeys.length ? trendKeys : monthlyKeys.length ? monthlyKeys : monthlyMonths,
      series
    },
    expense_categories: asArray(raw?.expense_categories ?? raw?.category_spend),
    income_channels: asArray(raw?.income_channels ?? income?.channels).map((row: any) => ({
      ...row,
      count: row?.count ?? row?.payout_count ?? 0
    })),
    top_suppliers: asArray(raw?.top_suppliers),
    top_materials: asArray(raw?.top_materials),
    materials_without_image: asArray(raw?.materials_without_image ?? operational?.materials_without_image),
    materials_without_cost: asArray(raw?.materials_without_cost ?? operational?.materials_without_cost),
    kits_missing_cost: asArray(raw?.kits_missing_cost ?? raw?.incomplete_kits ?? operational?.incomplete_kits).map((row: any) => ({
      ...row,
      missing_cost_count: row?.missing_cost_count ?? row?.missing_cost_items ?? 0,
      total_known_cost: row?.total_known_cost ?? row?.known_cost ?? 0
    })),
    pending_invoices: asArray(raw?.pending_invoices ?? operational?.draft_invoices),
    pending_payouts: asArray(raw?.pending_payouts ?? operational?.pending_payouts),
    reorder_alerts: asArray(raw?.reorder_alerts ?? operational?.reorder_materials).map((row: any) => ({
      ...row,
      effective_stock_qty: Number(row?.effective_stock_qty ?? 0),
      reorder_point: Number(row?.reorder_point ?? 0)
    }))
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    ...init
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json();
}

export const api = {
  summary: () => request<Summary>("/api/summary"),
  dashboardFinance: async (query = "") =>
    normalizeDashboardFinance(await request<any>(`/api/dashboard/finance${query ? `?${query}` : ""}`)),
  invoices: (includeDeleted = true) => request<Invoice[]>(`/api/invoices?include_deleted=${includeDeleted ? 1 : 0}`),
  invoiceDetail: (id: number) => request<InvoiceDetail>(`/api/invoices/${id}`),
  incomeSummary: () => request<IncomeSummary>("/api/income/summary"),
  payouts: (includeDeleted = true) => request<Payout[]>(`/api/channel-payouts?include_deleted=${includeDeleted ? 1 : 0}`),
  payoutDetail: (id: number) => request<Payout>(`/api/channel-payouts/${id}`),
  materials: (includeDeleted = true) => request<Material[]>(`/api/materials?include_deleted=${includeDeleted ? 1 : 0}`),
  suppliers: (includeDeleted = true) => request<Supplier[]>(`/api/suppliers?include_deleted=${includeDeleted ? 1 : 0}`),
  costs: () => request<CostRow[]>("/api/costs/materials"),
  costDetail: (id: number) => request<CostDetail>(`/api/costs/materials/${id}`),
  kits: (_includeDeleted = true) => request<KitRecipe[]>("/api/kit-recipes"),
  settings: () => request<Settings>("/api/settings"),
  shopifyConnection: () => request<ShopifyConnection>("/api/shopify/connection"),
  systemHealth: () => request<SystemHealth>("/api/system/health"),
  auditBusiness: (limit = 200) => request<AuditRow[]>(`/api/audit-log?scope=business&limit=${limit}`),
  auditTechnical: (limit = 200) => request<AuditRow[]>(`/api/audit-log?scope=technical&limit=${limit}`)
};
