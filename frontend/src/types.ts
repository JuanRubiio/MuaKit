export type DomainKey = "finance" | "operations" | "sales" | "system";
export type ViewKey =
  | "dashboard"
  | "expenses"
  | "income"
  | "costs"
  | "margins"
  | "materials"
  | "kits"
  | "orders"
  | "purchasing"
  | "channels"
  | "advertising"
  | "customers"
  | "activity"
  | "settings"
  | "diagnostics"
  | "logs";

export interface Summary {
  materials: number;
  shopify_products: number;
  suppliers: number;
  invoices: number;
  payouts: number;
  documents: number;
}

export interface Invoice {
  id: number;
  supplier_id: number | null;
  supplier_name?: string;
  invoice_number: string;
  invoice_date: string;
  category: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  status: string;
  notes?: string;
  is_deleted: number;
  line_count?: number;
  document_id?: number | null;
}

export interface InvoiceLine {
  id: number;
  material_id: number | null;
  material_name?: string;
  description?: string;
  package_count: number;
  units_per_package: number;
  total_units: number;
  price_per_package: number;
  line_total: number;
  notes?: string;
  is_deleted?: number;
}

export interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
}

export interface Payout {
  id: number;
  channel: string;
  payout_date: string;
  status: string;
  currency: string;
  gross_amount: number;
  refunds_amount: number;
  adjustments_amount: number;
  fees_amount: number;
  tax_withheld_amount: number;
  reserves_amount: number;
  advances_amount?: number;
  retried_amount?: number;
  net_amount: number;
  bank_reference?: string;
  bank_account_hint?: string;
  raw_source_file?: string;
  notes?: string;
  is_deleted: number;
}

export interface IncomeSummary {
  totals: {
    net_amount: number;
    gross_amount: number;
    fees_amount: number;
    pending_count: number;
    payout_count: number;
    month_net_amount: number;
    month_fees_amount: number;
  };
}

export interface Material {
  id: number;
  name: string;
  category: string;
  unit_label: string;
  preferred_supplier_id?: number | null;
  preferred_supplier_name?: string;
  shopify_inventory_qty?: number | null;
  shopify_available_qty?: number | null;
  effective_stock_qty?: number | null;
  reorder_point?: number | null;
  stock_target?: number | null;
  is_outlet: boolean;
  usage_type?: string;
  family?: string;
  subfamily?: string;
  variant?: string;
  base_material?: string;
  finish?: string;
  image_url_override?: string;
  image_url?: string;
  notes?: string;
  is_deleted: number;
}

export interface Supplier {
  id: number;
  name: string;
  category?: string;
  website?: string;
  average_lead_time_days?: number | null;
  notes?: string;
  is_deleted: number;
}

export interface CostRow {
  material_id: number;
  name: string;
  category: string;
  unit_label: string;
  purchase_lots: number;
  total_units_purchased: number;
  total_spend: number;
  weighted_avg_unit_cost_inc_vat: number | null;
  last_unit_cost_inc_vat: number | null;
  main_supplier_name?: string;
  inherited_cost?: number;
  cost_reference_material_id?: number;
  cost_reference_material_name?: string;
  is_outlet?: boolean;
}

export interface CostDetail {
  summary: CostRow;
  lots: Array<{
    line_id: number;
    invoice_id: number;
    invoice_number: string;
    invoice_date: string;
    supplier_name?: string;
    total_units: number;
    line_total: number;
    unit_cost: number | null;
    package_count: number;
    units_per_package: number;
    description?: string;
  }>;
}

export interface KitRecipeItem {
  id: number;
  material_id: number | null;
  material_name?: string;
  quantity: number;
  notes?: string;
  material_image_url?: string;
}

export interface KitRecipe {
  id: number;
  name: string;
  version?: string;
  is_complete: number;
  notes?: string;
  is_deleted: number;
  items: KitRecipeItem[];
  total_known_cost?: number;
  missing_cost_count?: number;
}

export interface AuditRow {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  actor: string;
  created_at: string;
  before_json?: string;
  after_json?: string;
}

export interface Settings {
  company_name: string;
  currency: string;
  dashboard_monthly_view: string;
  dashboard_income_monthly_view: string;
  low_stock_default: string;
  default_invoice_status: string;
  default_invoice_category: string;
  default_payout_channel: string;
  default_payout_status: string;
  reorder_alert_multiplier: string;
  [key: string]: string;
}

export interface ShopifyConnection {
  store_domain: string;
  api_version: string;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  pull_products: boolean;
  pull_inventory: boolean;
  pull_orders: boolean;
  pull_payouts: boolean;
  last_sync_at?: string;
  last_sync_status?: string;
  last_sync_summary?: unknown;
  client_id_masked?: string;
  client_secret_masked?: string;
}

export interface SystemHealth {
  app_version: string;
  db_file: string;
  db_size_bytes: number;
  db_integrity: string;
  latest_backup_at?: string;
  latest_backup_name?: string;
  backup_dir: string;
  migrations: {
    applied: Array<{ id: string; applied_at: string }>;
    pending: string[];
  };
  shopify: {
    configured: boolean;
    store_domain?: string;
    last_sync_at?: string;
    last_sync_status?: string;
  };
}

export interface DashboardFinance {
  window: { from: string; to: string; granularity: "day" | "month" };
  kpis: Record<string, number>;
  monthly_breakdown: {
    mode: "day" | "month";
    keys: string[];
    series: Record<string, number[]>;
  };
  expense_categories: Array<{ category: string; total: number; count: number }>;
  income_channels: Array<{ channel: string; net_amount: number; count: number }>;
  top_suppliers: Array<{ supplier_id: number | null; supplier_name: string; invoice_count: number; total_spend: number }>;
  top_materials: Array<{ material_id: number; name: string; category: string; purchase_lots: number; total_spend: number; weighted_avg_unit_cost_inc_vat: number | null }>;
  materials_without_image: Array<{ id: number; name: string; category: string }>;
  materials_without_cost: Array<{ material_id: number; name: string; category: string; purchase_lots: number }>;
  kits_missing_cost: Array<{ id: number; name: string; version?: string; missing_cost_count: number; total_known_cost: number }>;
  pending_invoices: Invoice[];
  pending_payouts: Payout[];
  reorder_alerts: Array<{ id: number; name: string; effective_stock_qty: number; reorder_point: number }>;
}
