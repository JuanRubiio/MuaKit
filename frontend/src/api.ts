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
  dashboardFinance: (query = "") => request<DashboardFinance>(`/api/dashboard/finance${query ? `?${query}` : ""}`),
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
