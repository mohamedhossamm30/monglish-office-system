// Script to generate complete procurement and recurring commitments data
import fs from 'fs';
import path from 'path';

const poData = [
  // Buffet Procurement Orders
  {
    id: 'po-bf-01',
    supplierId: null,
    supplier: 'شركة الأهرام للأغذية والمشروبات',
    date: '10/01/2026',
    isoDate: '2026-01-10',
    status: 'مكتمل',
    note: 'توريد شهري لمستلزمات البوفيه (سكر، لبن، بن، شاي)',
    by: 'المشتريات',
    lines: [
      { id: 'l1', itemId: 'BUFF-36', itemName: 'بن سليمان وسط نصف كيلو', cat: 'BUFF', unit: 'عبوة', qty: 10, price: 85, isNewItem: false },
      { id: 'l2', itemId: 'BUFF-50', itemName: 'سكر', cat: 'BUFF', unit: 'كجم', qty: 20, price: 27, isNewItem: false },
      { id: 'l3', itemId: 'BUFF-48', itemName: 'لبن جهينة', cat: 'BUFF', unit: 'كرتونة', qty: 24, price: 20, isNewItem: false },
      { id: 'l4', itemId: 'BUFF-44', itemName: 'شاى الربيع', cat: 'BUFF', unit: 'باكيت', qty: 5, price: 45, isNewItem: false }
    ]
  },
  {
    id: 'po-bf-02',
    supplierId: null,
    supplier: 'مؤسسة النيل للتغليف والورقيات',
    date: '25/01/2026',
    isoDate: '2026-01-25',
    status: 'مكتمل',
    note: 'أكواب قهوة وشاي وعصير للبوفيه والاستقبال',
    by: 'المشتريات',
    lines: [
      { id: 'l5', itemId: 'BUFF-01', itemName: 'اكواب شاى كرتون', cat: 'BUFF', unit: 'عدد', qty: 1000, price: 0.8, isNewItem: false },
      { id: 'l6', itemId: 'BUFF-02', itemName: 'اكواب قهوه سنجل', cat: 'BUFF', unit: 'عدد', qty: 1500, price: 0.7, isNewItem: false },
      { id: 'l7', itemId: 'BUFF-39', itemName: 'شاليموه كبير شاليموه', cat: 'BUFF', unit: 'باكيت', qty: 5, price: 35, isNewItem: false }
    ]
  },
  {
    id: 'po-bf-03',
    supplierId: null,
    supplier: 'سوق الخضار والفاكهة الطازجة',
    date: '15/02/2026',
    isoDate: '2026-02-15',
    status: 'مكتمل',
    note: 'فواكه طازجة لعصائر البوفيه (موز، برتقال، ليمون)',
    by: 'المشتريات',
    lines: [
      { id: 'l8', itemId: 'BUFF-19', itemName: 'موز بلدى فريش', cat: 'BUFF', unit: 'كجم', qty: 15, price: 25, isNewItem: false },
      { id: 'l9', itemId: 'BUFF-13', itemName: 'ليمون بلدى', cat: 'BUFF', unit: 'كجم', qty: 4, price: 30, isNewItem: false },
      { id: 'l10', itemId: 'BUFF-14', itemName: 'عصير مانجو فريش بيوريه', cat: 'BUFF', unit: 'لتر', qty: 10, price: 40, isNewItem: false }
    ]
  },
  // Office & Stationery Orders
  {
    id: 'po-off-01',
    supplierId: null,
    supplier: 'مكتبة ومطبعة الإسكندرية الحديثة',
    date: '05/02/2026',
    isoDate: '2026-02-05',
    status: 'مكتمل',
    note: 'أوراق تصوير وأقلام سبورة ومستلزمات تدريب',
    by: 'المشتريات',
    lines: [
      { id: 'l11', itemId: 'OFF-67', itemName: 'رزمة ورق تصوير A4', cat: 'OFF', unit: 'رزمة', qty: 20, price: 125, isNewItem: false },
      { id: 'l12', itemId: 'OFF-41', itemName: 'قلم سابوره ازرق', cat: 'OFF', unit: 'علبة', qty: 5, price: 60, isNewItem: false },
      { id: 'l13', itemId: 'OFF-42', itemName: 'قلم سابوره اسود', cat: 'OFF', unit: 'علبة', qty: 5, price: 60, isNewItem: false },
      { id: 'l14', itemId: 'OFF-48', itemName: 'ستيكى نوت ألوان', cat: 'OFF', unit: 'باكيت', qty: 20, price: 15, isNewItem: false },
      { id: 'l15', itemId: 'OFF-59', itemName: 'شميز شفاف 100 قطعة', cat: 'OFF', unit: 'باكيت', qty: 5, price: 45, isNewItem: false }
    ]
  },
  {
    id: 'po-off-02',
    supplierId: null,
    supplier: 'مطبعة الأهرام للتجليد',
    date: '20/02/2026',
    isoDate: '2026-02-20',
    status: 'مكتمل',
    note: 'مطبوعات ودفاتر مالية ومخزنية معتمدة للأكاديمية',
    by: 'المشتريات',
    lines: [
      { id: 'l16', itemId: 'OFF-83', itemName: 'دفتر توريد نقديه مالي', cat: 'OFF', unit: 'دفتر', qty: 20, price: 40, isNewItem: false },
      { id: 'l17', itemId: 'OFF-85', itemName: 'دفتر اضافة مخزن', cat: 'OFF', unit: 'دفتر', qty: 10, price: 35, isNewItem: false },
      { id: 'l18', itemId: 'OFF-86', itemName: 'دفتر صرف مخزن', cat: 'OFF', unit: 'دفتر', qty: 10, price: 35, isNewItem: false },
      { id: 'l19', itemId: 'OFF-28', itemName: 'ظرف كبير Monglsih A4 لوجو', cat: 'OFF', unit: 'عدد', qty: 200, price: 3.5, isNewItem: false }
    ]
  },
  // Cleaning Procurement
  {
    id: 'po-cln-01',
    supplierId: null,
    supplier: 'شركة كلين ماكس للمنظفات الصناعية',
    date: '01/02/2026',
    isoDate: '2026-02-01',
    status: 'مكتمل',
    note: 'مهمات نظافة شهرية ومطهرات القاعات ودورات المياه',
    by: 'المشتريات',
    lines: [
      { id: 'l20', itemId: 'CLN-05', itemName: 'ديتول مطهر مركز', cat: 'CLN', unit: 'لتر', qty: 12, price: 85, isNewItem: false },
      { id: 'l21', itemId: 'CLN-24', itemName: 'مناديل بكر تواليت جامبو', cat: 'CLN', unit: 'رول', qty: 150, price: 12, isNewItem: false },
      { id: 'l22', itemId: 'CLN-25', itemName: 'مناديل سحب مكاتب فاخرة', cat: 'CLN', unit: 'علبة', qty: 40, price: 28, isNewItem: false },
      { id: 'l23', itemId: 'CLN-18', itemName: 'اكياس قمامة كبير أسود', cat: 'CLN', unit: 'لفة', qty: 10, price: 45, isNewItem: false },
      { id: 'l24', itemId: 'CLN-07', itemName: 'هاند ووش صابون سائل يدوي', cat: 'CLN', unit: 'جركن', qty: 8, price: 55, isNewItem: false }
    ]
  },
  // Electronics & IT Equipment
  {
    id: 'po-el-01',
    supplierId: null,
    supplier: 'تكنولوجي مول سموحة',
    date: '18/02/2026',
    isoDate: '2026-02-18',
    status: 'مكتمل',
    note: 'مستلزمات فصول الأونلاين وكاميرات وسماعات',
    by: 'المشتريات',
    lines: [
      { id: 'l25', itemId: 'ELEC-14', itemName: 'كاميرا ويب 2B Full HD', cat: 'ELEC', unit: 'عدد', qty: 6, price: 550, isNewItem: false },
      { id: 'l26', itemId: 'ELEC-22', itemName: 'سماعة رأس plantronics مع مايك عازل', cat: 'ELEC', unit: 'عدد', qty: 10, price: 680, isNewItem: false },
      { id: 'l27', itemId: 'ELEC-46', itemName: 'ماووس كمبيوتر USB', cat: 'ELEC', unit: 'عدد', qty: 8, price: 95, isNewItem: false },
      { id: 'l28', itemId: 'ELEC-49', itemName: 'كابل باور شاشات وكيسات', cat: 'ELEC', unit: 'عدد', qty: 15, price: 40, isNewItem: false }
    ]
  },
  // Incoming Shipment awaiting receipt by Warehouse
  {
    id: 'po-incoming-01',
    supplierId: null,
    supplier: 'شركة الأهرام للورقيات',
    date: '02/09/2026',
    isoDate: '2026-09-02',
    status: 'قيد التوريد',
    note: 'توريد عاجل رزم ورق تصوير A4 وأحبار جديدة (بانتظار فحص واستلام المخزن)',
    by: 'المشتريات',
    lines: [
      { id: 'l29', itemId: 'OFF-67', itemName: 'رزمة ورق تصوير A4', cat: 'OFF', unit: 'رزمة', qty: 15, price: 130, isNewItem: false },
      { id: 'l30', itemId: 'OFF-88', itemName: 'احبار للطابعه HP', cat: 'OFF', unit: 'عبوة', qty: 4, price: 380, isNewItem: false }
    ]
  },
  {
    id: 'po-incoming-02',
    supplierId: null,
    supplier: 'شركة بوفيه مصر للضيافة',
    date: '05/09/2026',
    isoDate: '2026-09-05',
    status: 'قيد التوريد',
    note: 'شحنة كراتين لبن وسكر وبن عاجلة (بانتظار فحص واستلام المخزن)',
    by: 'المشتريات',
    lines: [
      { id: 'l31', itemId: 'BUFF-36', itemName: 'بن سليمان وسط نصف كيلو', cat: 'BUFF', unit: 'عبوة', qty: 12, price: 88, isNewItem: false },
      { id: 'l32', itemId: 'BUFF-48', itemName: 'لبن جهينة', cat: 'BUFF', unit: 'كرتونة', qty: 20, price: 22, isNewItem: false },
      { id: 'l33', itemId: 'BUFF-50', itemName: 'سكر', cat: 'BUFF', unit: 'كجم', qty: 25, price: 28, isNewItem: false }
    ]
  }
];

// Recurring commitments (الالتزامات والأقساط)
const commitmentsData = [
  {
    id: 'rec-01',
    title: 'إيجار مقر الأكاديمية الرئيسي (فرع الإسكندرية)',
    supplier: 'مالك العقار - سموحة',
    estCost: 45000,
    type: 'rent',
    period: 'monthly',
    active: true,
    totalInstallments: 12,
    remainingInstallments: 4,
    nextDue: '2026-10-01',
    paymentMethod: 'تحويل بنكي',
    notes: 'إيجار شهري ثابت لفرع سموحة يشمل طابقين',
    history: [
      { id: 'p-1', date: '01/09/2026', amount: 45000, by: 'المدير', note: 'سداد إيجار شهر سبتمبر 2026' },
      { id: 'p-2', date: '01/08/2026', amount: 45000, by: 'المدير', note: 'سداد إيجار شهر أغسطس 2026' }
    ]
  },
  {
    id: 'rec-02',
    title: 'اشتراك خطوط الإنترنت فايبر فائق السرعة (WE Business)',
    supplier: 'الشركة المصرية للاتصالات WE',
    estCost: 3800,
    type: 'subscription',
    period: 'monthly',
    active: true,
    totalInstallments: 12,
    remainingInstallments: 5,
    nextDue: '2026-09-25',
    paymentMethod: 'فوري / فيزا',
    notes: 'خطين فايبر رئيسي واحتياطي لضمان استقرار فصول الأونلاين',
    history: [
      { id: 'p-3', date: '25/08/2026', amount: 3800, by: 'الإدارة المالية', note: 'سداد فاتورة أغسطس' }
    ]
  },
  {
    id: 'rec-03',
    title: 'قسط تجهيز قاعات المحاضرات وأجهزة التكييف',
    supplier: 'شركة كاريير للتكييف والتبريد',
    estCost: 8500,
    type: 'installment_monthly',
    period: 'monthly',
    active: true,
    totalInstallments: 10,
    remainingInstallments: 3,
    nextDue: '2026-09-15',
    paymentMethod: 'شيك بنكي',
    notes: 'قسط شهري لتوريد وتركيب تكييفات القاعات الجديدة (متبقي 3 شيكات)',
    history: [
      { id: 'p-4', date: '15/08/2026', amount: 8500, by: 'المدير', note: 'سداد شيك رقم 4092' },
      { id: 'p-5', date: '15/07/2026', amount: 8500, by: 'المدير', note: 'سداد شيك رقم 4091' }
    ]
  },
  {
    id: 'rec-04',
    title: 'فاتورة باقات خطوط الموبايل للفرع والمبيعات (Vodafone Red)',
    supplier: 'شركة فودافون مصر',
    estCost: 4600,
    type: 'subscription',
    period: 'monthly',
    active: true,
    totalInstallments: 12,
    remainingInstallments: 4,
    nextDue: '2026-09-28',
    paymentMethod: 'فوري / فيزا',
    notes: 'باقات الاتصال ومكالمات خدمة العملاء والمبيعات والمدرسين',
    history: [
      { id: 'p-6', date: '28/08/2026', amount: 4600, by: 'الإدارة المالية', note: 'سداد باقة شهر أغسطس' }
    ]
  },
  {
    id: 'rec-05',
    title: 'قسط توريد شاشات وأجهزة كمبيوتر المعامل',
    supplier: 'تكنولوجي مول سموحة',
    estCost: 12000,
    type: 'installment_monthly',
    period: 'monthly',
    active: true,
    totalInstallments: 6,
    remainingInstallments: 1,
    nextDue: '2026-09-20',
    paymentMethod: 'شيك بنكي',
    notes: 'قسط أجهزة معامل الاختبارات وتدريب اللغات (القسط قبل الأخير)',
    history: [
      { id: 'p-7', date: '20/08/2026', amount: 12000, by: 'المدير', note: 'سداد قسط أغسطس' }
    ]
  }
];

fs.writeFileSync(
  path.join(process.cwd(), 'src/data/monglishProcurement.json'),
  JSON.stringify(poData, null, 2),
  'utf-8'
);

fs.writeFileSync(
  path.join(process.cwd(), 'src/data/monglishCommitments.json'),
  JSON.stringify(commitmentsData, null, 2),
  'utf-8'
);

console.log('Saved procurement and commitments data successfully.');
