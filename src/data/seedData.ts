import { CategoryKey, CategoryMeta, CleaningTask, InventoryItem, MaintenanceAsset, RoleKey, TabKey } from '../types';

export const ROLES: Record<string, { label: string; icon: string; email: string; tabs: TabKey[]; isCustom?: boolean }> = {
  manager: {
    label: 'المدير',
    icon: '👔',
    email: 'manager@monglish.local',
    tabs: ['dashboard', 'inventory', 'procurement', 'maintenance', 'buffet', 'cleaning', 'lines', 'requests', 'costs', 'reports', 'settings', 'ai']
  },
  warehouse: {
    label: 'المخازن',
    icon: '📦',
    email: 'warehouse@monglish.local',
    tabs: ['inventory', 'requests']
  },
  purchase: {
    label: 'المشتريات',
    icon: '🧾',
    email: 'purchase@monglish.local',
    tabs: ['procurement', 'requests']
  },
  buffet: {
    label: 'البوفيه',
    icon: '☕',
    email: 'buffet@monglish.local',
    tabs: ['buffet', 'requests']
  },
  maint: {
    label: 'الصيانة',
    icon: '🛠️',
    email: 'maint@monglish.local',
    tabs: ['maintenance', 'requests']
  },
  cleaning: {
    label: 'النظافة (تيم ليدر / مشرف)',
    icon: '🧴',
    email: 'cleaning@monglish.local',
    tabs: ['cleaning', 'requests']
  },
  reception: {
    label: 'الريسبشن',
    icon: '📞',
    email: 'reception@monglish.local',
    tabs: ['lines', 'requests']
  }
};

export const TABS_META: Record<TabKey, { label: string; icon: string }> = {
  dashboard: { label: 'نظرة عامة', icon: '📊' },
  inventory: { label: 'المخازن', icon: '📦' },
  procurement: { label: 'المشتريات', icon: '🧾' },
  maintenance: { label: 'الصيانة', icon: '🛠️' },
  buffet: { label: 'البوفيه', icon: '☕' },
  cleaning: { label: 'النظافة', icon: '🧴' },
  lines: { label: 'خطوط الموبايل', icon: '📞' },
  requests: { label: 'الطلبات', icon: '📋' },
  costs: { label: 'التكاليف والأداء', icon: '💰' },
  reports: { label: 'التقارير', icon: '📈' },
  settings: { label: 'الإعدادات والمستخدمين', icon: '⚙️' },
  ai: { label: 'المستشار الذكي (AI)', icon: '✨' }
};

export const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
  OFF: { n: 'أدوات مكتبية وقرطاسية', icon: '✏️' },
  STAT: { n: 'أدوات مكتبية وقرطاسية', icon: '✏️' },
  BUFF: { n: 'بوفيه وضيافة', icon: '☕' },
  CLN: { n: 'نظافة ومطهرات', icon: '🧴' },
  ELEC: { n: 'إلكترونيات وأجهزة', icon: '🖥️' },
  MED: { n: 'أدوية وإسعافات', icon: '💊' },
  FURN: { n: 'أثاث وتجهيزات', icon: '🪑' },
  TECH: { n: 'أجهزة وتقنية', icon: '💻' }
};

import monglishItems from './monglishDataset.json';

export const SEED_ITEMS: InventoryItem[] = (monglishItems as InventoryItem[]).length > 0
  ? (monglishItems as InventoryItem[])
  : [
      { id: 'i1', code: 'OFF-01', name: 'تليفون أرضي', cat: 'OFF', unit: 'عدد', balance: 5, min: 3, cost: 350 },
      { id: 'i2', code: 'OFF-05', name: 'بطاريات وسط', cat: 'OFF', unit: 'عدد', balance: 8, min: 10, cost: 15 }
    ];

export const SEED_CLEAN: CleaningTask[] = [
  { id: 'c1', name: 'تنظيف المكاتب', freq: 'يومي', area: 'كل الطوابق', done: false, assignee: 'غير محدد' },
  { id: 'c2', name: 'تنظيف دورات المياه', freq: 'يومي', area: 'كل الأدوار', done: false, assignee: 'غير محدد' },
  { id: 'c3', name: 'مسح الأرضيات', freq: 'يومي', area: 'الممرات', done: false, assignee: 'غير محدد' },
  { id: 'c4', name: 'تنظيف النوافذ', freq: 'أسبوعي', area: 'الجبهة', done: false, assignee: 'غير محدد' },
  { id: 'c5', name: 'تعقيم المطبخ', freq: 'أسبوعي', area: 'المطبخ', done: false, assignee: 'غير محدد' }
];

export const SEED_ASSETS: MaintenanceAsset[] = [
  {
    id: 'ast_ac_main',
    assetCode: 'AC-HQ-01',
    name: 'تكييفات القاعة الكبرى المركزية',
    category: 'تكييفات_وتبريد',
    location: 'الدور الأرضي — قاعة المؤتمرات الرئيسية',
    periodDays: 60,
    periodTitle: 'كل شهرين (صيانة فلاتر وغاز)',
    lastMaintenanceDate: '2026-07-28',
    nextDueDate: '2026-09-26', // Approaching in 2 days!
    alertDaysBefore: 7,
    assignedTechnician: 'م/ سامح التميمي — شركة كاريير المعتمدة',
    vendorPhone: '01012345678',
    status: 'active',
    estimatedCost: 850,
    notes: 'تنظيف فلاتر التبريد، فحص ضغط غاز الفريون، والتأكد من لوحة التحكم الذكية'
  },
  {
    id: 'ast_gen_01',
    assetCode: 'GEN-01',
    name: 'المولد الكهربائي الاحتياطي (ديزل)',
    category: 'كهرباء_ومولدات',
    location: 'فناء المبنى الخلفي — غرفة المولد',
    periodDays: 30,
    periodTitle: 'شهري (فحص زيوت وفلاتر)',
    lastMaintenanceDate: '2026-08-25',
    nextDueDate: '2026-09-24', // Due today!
    alertDaysBefore: 5,
    assignedTechnician: 'م/ حسام علام — مهندس القوى والديزل',
    vendorPhone: '01223456789',
    status: 'active',
    estimatedCost: 650,
    notes: 'اختبار تشغيل الحمل، فحص مستوى زيت المحرك، وفحص البطارية والشاحن التلقائي'
  },
  {
    id: 'ast_elev_01',
    assetCode: 'ELEV-01',
    name: 'مصعد الركاب الرئيسي للمبنى',
    category: 'مصاعد_ومرافق',
    location: 'المدخل الرئيسي — برج المصعد',
    periodDays: 30,
    periodTitle: 'شهري (فحص وتزييت سنترال كابينة)',
    lastMaintenanceDate: '2026-09-01',
    nextDueDate: '2026-10-01',
    alertDaysBefore: 7,
    assignedTechnician: 'شركة أوتيس للمصاعد — فريق الطوارئ',
    vendorPhone: '01198765432',
    status: 'active',
    estimatedCost: 1200,
    notes: 'فحص كابلات الجر، فرامل الطوارئ، حساسات الأبواب، وتشحيم السكك الحديدية'
  },
  {
    id: 'ast_water_01',
    assetCode: 'WTR-FLT-01',
    name: 'محطة تنقية وفلاتر مياه الشرب والكولديرات',
    category: 'مياه_وصحي',
    location: 'أدوار المبنى (1، 2، 3) + البوفيه',
    periodDays: 90,
    periodTitle: 'ربع سنوي (تغيير شمعات ومراحل)',
    lastMaintenanceDate: '2026-06-20',
    nextDueDate: '2026-09-20', // Overdue by 4 days!
    alertDaysBefore: 10,
    assignedTechnician: 'فني الفلاتر — شركة النقاء',
    vendorPhone: '01555544433',
    status: 'active',
    estimatedCost: 450,
    notes: 'استبدال شمعات المراحل الثلاث الأولى، وفحص كفاءة ممبرين التناضح العكسي'
  },
  {
    id: 'ast_net_01',
    assetCode: 'NET-SRV-01',
    name: 'سيرفرات الشبكة الرئيسية ووحدات الـ UPS',
    category: 'أجهزة_وتقنية',
    location: 'غرفة التحكم والشبكات (Server Room) — الدور الأول',
    periodDays: 90,
    periodTitle: 'ربع سنوي (تنظيف مراوح وفحص بطاريات)',
    lastMaintenanceDate: '2026-07-15',
    nextDueDate: '2026-10-15',
    alertDaysBefore: 14,
    assignedTechnician: 'فريق تقنية المعلومات والشبكات IT',
    vendorPhone: '01009876543',
    status: 'active',
    estimatedCost: 300,
    notes: 'طرد الغبار من السيرفرات، فحص سعة بطاريات الـ UPS الاحتياطية وتحديث السوفتوير'
  },
  {
    id: 'ast_fire_01',
    assetCode: 'SEC-FIRE-01',
    name: 'منظومة طفايات الحريق وخراطيم الطوارئ',
    category: 'معدات_أمان_وسلامة',
    location: 'جميع الطوابق ومخارج الطوارئ',
    periodDays: 180,
    periodTitle: 'نصف سنوي (فحص ضغط وشهادة سلامة)',
    lastMaintenanceDate: '2026-04-10',
    nextDueDate: '2026-10-10',
    alertDaysBefore: 20,
    assignedTechnician: 'شركة الأمان لأنظمة الإطفاء والسلامة',
    vendorPhone: '01233445566',
    status: 'active',
    estimatedCost: 1500,
    notes: 'معايرة مؤشرات الضغط لطفاية البودرة والـ CO2، والتأكد من سلامة مضخة الحريق'
  }
];

