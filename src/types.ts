export type RoleKey = 
  | 'manager' 
  | 'warehouse' 
  | 'purchase' 
  | 'buffet' 
  | 'maint' 
  | 'cleaning' 
  | 'reception'
  | string;

export type TabKey = 
  | 'dashboard' 
  | 'inventory' 
  | 'procurement' 
  | 'maintenance' 
  | 'buffet' 
  | 'cleaning' 
  | 'lines' 
  | 'requests' 
  | 'costs' 
  | 'reports'
  | 'settings'
  | 'ai';

export interface DepartmentUserPermission {
  canCreateProc: boolean;
  canReceiveProc: boolean;
  canEditInventory: boolean;
  canIssueWarehouse: boolean;
  canManageMaint: boolean;
  canManageClean: boolean;
  canManageTelecom: boolean;
  canManageFinance: boolean;
  canAccessAi: boolean;
}

export interface DepartmentPersonnel {
  id: string;
  name: string;
  roleKey: string;
  deptName: string;
  phone?: string;
  isLeader?: boolean;
  permissions: DepartmentUserPermission;
}

export interface RoleConfig {
  key: string;
  label: string;
  icon: string;
  email?: string;
  tabs: TabKey[];
  isCustom?: boolean;
  managerName?: string;
  managerPhone?: string;
  permissions?: Partial<DepartmentUserPermission>;
  staffMembers?: DepartmentPersonnel[];
}

export interface AuthUser {
  uid: string;
  email: string;
  username?: string;
  displayName?: string;
  role: RoleKey;
  label: string;
  canWrite: string[];
  canStockMove: boolean;
  allowedTabs?: TabKey[];
  active?: boolean;
}

export interface UserAccount {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  role: RoleKey;
  label: string;
  canWrite: string[];
  canStockMove: boolean;
  allowedTabs: TabKey[];
  active: boolean;
  createdAt?: any;
  createdBy?: string;
  updatedAt?: any;
  updatedBy?: string;
}

export interface SystemActivity {
  id: string;
  dept: string;
  action: string;
  details: string;
  amount?: number;
  quantity?: number | string;
  by: string;
  date: string;
  time: string;
  ts: number;
  read?: boolean;
  type?: 'purchase' | 'maint' | 'clean' | 'warehouse' | 'request' | 'line' | 'system';
  severity?: 'critical' | 'warning' | 'info' | 'success';
}

export type CategoryKey = 'OFF' | 'STAT' | 'ELEC' | 'MED' | 'BUFF' | 'CLN' | 'FURN' | 'TECH';

export interface CategoryMeta {
  n: string;
  icon: string;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  cat: CategoryKey;
  unit: string;
  balance: number;
  min: number;
  cost: number;
  loc?: string;
}

export interface StockMove {
  id: string;
  itemId: string;
  itemName: string;
  code: string;
  cat: CategoryKey;
  type: 'in' | 'out';
  qty: number;
  cost: number;
  person?: string;
  department?: string;
  note?: string;
  date: string;
  ts: number;
  by: string;
  orderId?: string;
  adjustment?: boolean;
  voucherNo?: string;
  docType?: 'GRN' | 'ISU' | 'ADJ' | string;
}

export interface PurchaseOrderLine {
  id: string;
  itemId: string | null;
  itemName: string;
  cat: CategoryKey;
  code?: string;
  unit: string;
  qty: number;
  price: number;
  isNewItem?: boolean;
  newMin?: number;
  taxable?: boolean;
  taxRate?: number;
}

export interface PurchaseOrder {
  id: string;
  orderNumber?: string;
  supplierId: string | null;
  supplier: string;
  date: string;
  isoDate: string;
  status: 'قيد التنفيذ' | 'جاهز للاستلام' | 'مكتمل' | 'تم الاستلام' | 'ملغي';
  note?: string;
  by: string;
  lines: PurchaseOrderLine[];
  receivedDate?: string;
  receivedBy?: string;
  receiptNote?: string;
  invoiceNumber?: string;
  hasTax?: boolean;
  taxRate?: number;
  shippingCost?: number;
  subtotal?: number;
  taxTotal?: number;
  totalAmount?: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
}

export interface RecurringTemplate {
  id: string;
  itemId?: string;
  itemName?: string;
  cat?: CategoryKey;
  title: string;
  supplier?: string;
  qty?: number;
  unit?: string;
  price?: number;
  estCost: number;
  type?: 'installment_monthly' | 'installment_annual' | 'rent' | 'subscription' | 'contract' | 'other';
  period?: 'monthly' | 'weekly' | 'quarterly' | 'yearly';
  freq?: string;
  freqDays?: number;
  active: boolean;
  lastOrdered?: string | null;
  nextDue?: string | null;
  remainingInstallments?: number;
  totalInstallments?: number;
  paymentMethod?: string;
  notes?: string;
  history?: {
    id: string;
    date: string;
    amount: number;
    by: string;
    note?: string;
  }[];
}

export interface DepartmentKPI {
  id: string;
  dept: string;
  name: string;
  actual: number;
  target: number;
  unit: string;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  description: string;
}

export interface MaintenanceRepairStep {
  id: string;
  stepNumber?: number;
  order?: number;
  title: string;
  note?: string;
  technician?: string;
  date?: string;
  completed: boolean;
  completedAt?: string;
}

export interface AssetMaintenanceLog {
  id: string;
  date: string;
  isoDate?: string;
  cost: number;
  technician?: string;
  notes?: string;
  performedBy?: string;
  ticketId?: string;
  ticketNumber?: string;
}

export type AssetCategory =
  | 'تكييفات_وتبريد'
  | 'كهرباء_ومولدات'
  | 'أجهزة_وتقنية'
  | 'معدات_أمان_وسلامة'
  | 'مصاعد_ومرافق'
  | 'مياه_وصحي'
  | 'أثاث_وتجهيزات'
  | 'أخرى';

export interface MaintenanceAsset {
  id: string;
  assetCode: string;
  name: string;
  category: AssetCategory;
  location: string;
  periodDays: number; // e.g. 30, 60, 90, 180, 365
  periodTitle?: string; // شهري، ربع سنوي، نصف سنوي، سنوي
  lastMaintenanceDate?: string; // YYYY-MM-DD
  nextDueDate: string; // YYYY-MM-DD
  alertDaysBefore: number; // e.g. 7 (days prior to alert)
  assignedTechnician?: string;
  vendorPhone?: string;
  status: 'active' | 'under_maintenance' | 'inactive';
  notes?: string;
  estimatedCost?: number;
  history?: AssetMaintenanceLog[];
  createdTs?: number;
  updatedTs?: number;
}

export interface MaintenanceTicket {
  id: string;
  ticketNumber?: string;
  title: string;
  location: string;
  priority: 'عاجل' | 'متوسط' | 'منخفض';
  note?: string;
  status: 'جديد' | 'قيد الإصلاح' | 'مغلق' | 'غير قابل للإصلاح';
  unrepairableReason?: string;
  technicianName?: string;
  technicianDate?: string;
  technicianReport?: string;
  repairSteps?: MaintenanceRepairStep[];
  currentStep?: string;
  handoverStatus?: 'لم_يتم_الاستلام' | 'تم_الاستلام';
  handoverDate?: string;
  handoverBy?: string;
  repairDate?: string;
  date: string;
  isoDate?: string;
  createdTs: number;
  cost: number;
  closedTs?: number;
  by: string;
  assetId?: string;
  assetCode?: string;
  assetName?: string;
  isPeriodic?: boolean;
}

export interface PettyCashExpense {
  id: string;
  voucherNo?: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  amount: number;
  title: string;
  category: 'ضيافة_وطوارئ' | 'نقل_ومشاوير' | 'أدوات_ومستلزمات' | 'شحن_وطرود' | 'صيانة_عاجلة' | 'مكتبية_وطباعة' | 'أخرى';
  paidBy: string;
  department?: string;
  paymentMethod: 'عهدة_نقدية' | 'خزينة' | 'محفظة_إلكترونية' | 'أخرى';
  receiptNo?: string;
  notes?: string;
  ts: number;
  createdByUid?: string;
}

export interface CleaningTask {
  id: string;
  name: string;
  area: string;
  freq: string;
  done: boolean;
  assignee: string;
}

export interface CleaningHistory {
  id: string;
  date: string;
  isoDate: string;
  total: number;
  done: number;
  pct: number;
  tasks: {
    name: string;
    done: boolean;
    assignee: string;
    area: string;
  }[];
}

export interface MobileLine {
  id: string;
  number: string;
  employee?: string;
  nationalId?: string;
  status: 'نشط' | 'معطل';
  plan?: string;
  monthlyCost: number;
  note?: string;
  addedDate?: string;
  custodyVoucherNo?: string;
}

export interface RequestItem {
  id: string;
  title: string;
  note?: string;
  from: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
  createdTs: number;
  decidedTs?: number;
}

export interface DepartmentRequest {
  id: string;
  requestCode?: string;
  title: string;
  dept: string;
  cat: string;
  urgency: 'عاجل' | 'عادي';
  note?: string;
  status: 'جديد' | 'معتمد' | 'مرفوض' | 'منجز';
  date: string;
  by: string;
  rejectReason?: string;
  createdByUid?: string;
}

export interface PhysicalStocktake {
  id: string;
  stocktakeCode?: string;
  itemId: string;
  itemName: string;
  cat: CategoryKey;
  systemBalance: number;
  physicalCount: number;
  variance: number;
  date: string;
  ts: number;
  by: string;
}

export type SyncStatusType = 'ok' | 'fail' | 'syncing' | 'synced' | 'local' | 'saved' | 'idle' | 'offline';
