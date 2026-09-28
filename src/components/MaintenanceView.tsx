import React, { useState, useMemo, useEffect } from 'react';
import {
  MaintenanceTicket,
  MaintenanceRepairStep,
  MaintenanceAsset,
  AssetMaintenanceLog,
  AssetCategory,
  RoleKey,
  AuthUser
} from '../types';
import {
  fmtDuration,
  today,
  isoToday,
  uid,
  isDateInRange,
  normalizeDateToIso,
  addDeletedMaintId,
  getNextDocumentSequence,
  loadData,
  saveData,
  getAssetDueStatus,
  checkAndGenerateAssetMaintenanceAlerts,
  formatDateDisplay
} from '../utils/storage';
import { SEED_ASSETS } from '../data/seedData';
import { DocumentSequenceBadge } from './DocumentSequenceBadge';
import { DateFilterBar, DateFilterValue } from './DateFilterBar';
import { ConfirmModal } from './ConfirmModal';
import {
  CheckCircle2,
  Clock,
  Download,
  Plus,
  Trash2,
  Wrench,
  X,
  Calendar,
  Filter,
  Search,
  CheckSquare,
  Square,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Layers,
  AlertCircle,
  AlertOctagon,
  Ban,
  RotateCcw,
  FileText,
  Bell,
  BellRing,
  Sparkles,
  ShieldAlert,
  Building,
  Check,
  Edit2,
  History,
  Phone,
  Settings,
  ArrowRight,
  ExternalLink
} from 'lucide-react';

interface MaintenanceViewProps {
  maint: MaintenanceTicket[];
  assets?: MaintenanceAsset[];
  currentRole: RoleKey;
  authUser?: AuthUser | null;
  onSaveMaint: (newMaint: MaintenanceTicket[]) => void;
  onSaveAssets?: (newAssets: MaintenanceAsset[]) => void;
  onExportCSV: (type: string) => void;
  showToast: (msg: string) => void;
}

const DEFAULT_REPAIR_STEPS = [
  'معاينة وفحص العطل وتحديد القطع التالفة',
  'توفير قطع الغيار ومستلزمات الصيانة',
  'التنفيذ الفعلي للإصلاح الفني',
  'اختبار تشغيل ومراقبة الأداء والجودة',
  'تسليم القاعة / الجهاز للجهة الطالبة'
];

const ASSET_CATEGORIES: { key: AssetCategory; label: string; icon: string }[] = [
  { key: 'تكييفات_وتبريد', label: 'تكييفات وتبريد', icon: '❄️' },
  { key: 'كهرباء_ومولدات', label: 'كهرباء ومولدات', icon: '⚡' },
  { key: 'أجهزة_وتقنية', label: 'أجهزة وشبكات وتقنية', icon: '💻' },
  { key: 'مصاعد_ومرافق', label: 'مصاعد ومرافق المبنى', icon: '🛗' },
  { key: 'مياه_وصحي', label: 'مياه وفلاتر وصحي', icon: '🚰' },
  { key: 'معدات_أمان_وسلامة', label: 'أمان وإطفاء حريق', icon: '🧯' },
  { key: 'أثاث_وتجهيزات', label: 'أثاث وتجهيزات قاعات', icon: '🪑' },
  { key: 'أخرى', label: 'أصول ومعدات أخرى', icon: '🏢' }
];

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  maint = [],
  assets: propAssets,
  currentRole,
  authUser,
  onSaveMaint,
  onSaveAssets,
  onExportCSV,
  showToast
}) => {
  const isMgr = currentRole === 'manager';
  const canWriteMaint = isMgr || (authUser?.canWrite ? authUser.canWrite.includes('maint') : true);
  const canWriteAssets = isMgr || (authUser?.canWrite ? authUser.canWrite.includes('assets') : true);

  // Sub Tabs: 'tickets' (أعطال وبلاغات) | 'assets' (الأصول وجداول الصيانة الدورية) | 'history' (سجل تاريخ الصيانات)
  const [activeSubTab, setActiveSubTab] = useState<'tickets' | 'assets' | 'history'>('tickets');

  // Local Assets State
  const [isLoadingAssets, setIsLoadingAssets] = useState<boolean>(true);
  const [localAssets, setLocalAssets] = useState<MaintenanceAsset[]>(() => {
    if (propAssets && propAssets.length > 0) return propAssets;
    const loaded = loadData<MaintenanceAsset[]>('ASSETS');
    return loaded && loaded.length > 0 ? loaded : [];
  });

  useEffect(() => {
    if (propAssets !== undefined) {
      setLocalAssets(propAssets);
      setIsLoadingAssets(false);
    }
  }, [propAssets]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoadingAssets(false);
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  // Run automatic maintenance alert check on mount and when assets change
  useEffect(() => {
    if (localAssets && localAssets.length > 0) {
      const generated = checkAndGenerateAssetMaintenanceAlerts(localAssets);
      if (generated.length > 0) {
        showToast(`🔔 تنبيه تلقائي: تم رصد ${generated.length} أصول اقترب أو حان موعد صيانتها الدورية`);
      }
    }
  }, [localAssets]);

  const handleUpdateAssets = (newAssets: MaintenanceAsset[]) => {
    setLocalAssets(newAssets);
    saveData('ASSETS', newAssets);
    if (onSaveAssets) {
      onSaveAssets(newAssets);
    }
  };

  // Add Ticket Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState<'عاجل' | 'متوسط' | 'منخفض'>('متوسط');
  const [ticketDateIso, setTicketDateIso] = useState<string>(isoToday());
  const [note, setNote] = useState('');
  const [linkedAssetId, setLinkedAssetId] = useState<string>('');

  // Close ticket modal
  const [closingTicket, setClosingTicket] = useState<MaintenanceTicket | null>(null);
  const [closeCost, setCloseCost] = useState('0');
  const [closeNote, setCloseNote] = useState('');

  // Unrepairable ticket modal (قرار الفني: غير قابل للإصلاح)
  const [unrepairableTicket, setUnrepairableTicket] = useState<MaintenanceTicket | null>(null);
  const [unrepairableReason, setUnrepairableReason] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [technicianReport, setTechnicianReport] = useState('');

  // Handover confirmation modal
  const [handoverTicket, setHandoverTicket] = useState<MaintenanceTicket | null>(null);
  const [handoverRecipient, setHandoverRecipient] = useState('');
  const [handoverDateIso, setHandoverDateIso] = useState<string>(isoToday());

  // Add step modal
  const [activeStepTicketId, setActiveStepTicketId] = useState<string | null>(null);
  const [newStepTitle, setNewStepTitle] = useState('');

  // Expanded ticket steps view
  const [expandedTicketIds, setExpandedTicketIds] = useState<Record<string, boolean>>({});
  const [deleteTargetTicketId, setDeleteTargetTicketId] = useState<string | null>(null);

  // Filters State for Tickets
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'جديد' | 'قيد الإصلاح' | 'مغلق' | 'غير قابل للإصلاح'>('all');
  const [handoverFilter, setHandoverFilter] = useState<'all' | 'تم_الاستلام' | 'لم_يتم_الاستلام'>('all');
  const [maintDateFilter, setMaintDateFilter] = useState<DateFilterValue>({
    preset: 'all',
    startDate: '',
    endDate: ''
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Asset Modals & Filters State
  const [showAddAssetModal, setShowAddAssetModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<MaintenanceAsset | null>(null);
  const [completingAssetMaint, setCompletingAssetMaint] = useState<MaintenanceAsset | null>(null);
  const [deleteTargetAssetId, setDeleteTargetAssetId] = useState<string | null>(null);

  // Asset Form State
  const [assetName, setAssetName] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [assetCategory, setAssetCategory] = useState<AssetCategory>('تكييفات_وتبريد');
  const [assetLocation, setAssetLocation] = useState('');
  const [assetPeriodDays, setAssetPeriodDays] = useState('60');
  const [assetPeriodTitle, setAssetPeriodTitle] = useState('كل شهرين');
  const [assetLastDate, setAssetLastDate] = useState(isoToday());
  const [assetNextDue, setAssetNextDue] = useState('');
  const [assetAlertDays, setAssetAlertDays] = useState('7');
  const [assetTech, setAssetTech] = useState('');
  const [assetPhone, setAssetPhone] = useState('');
  const [assetEstCost, setAssetEstCost] = useState('0');
  const [assetNotes, setAssetNotes] = useState('');

  // Log Completion State
  const [completeMaintDate, setCompleteMaintDate] = useState(isoToday());
  const [completeMaintCost, setCompleteMaintCost] = useState('0');
  const [completeMaintTech, setCompleteMaintTech] = useState('');
  const [completeMaintNotes, setCompleteMaintNotes] = useState('');
  const [autoAdvanceNextDue, setAutoAdvanceNextDue] = useState(true);

  // Asset Filters
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<string>('all');
  const [assetDueStatusFilter, setAssetDueStatusFilter] = useState<'all' | 'alerts_only' | 'overdue' | 'due_soon' | 'on_track'>('all');
  const [assetSearchQuery, setAssetSearchQuery] = useState('');

  const toggleExpand = (id: string) => {
    setExpandedTicketIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openTicketsCount = maint.filter((t) => t.status === 'جديد' || t.status === 'قيد الإصلاح').length;
  const closedTicketsCount = maint.filter((t) => t.status === 'مغلق').length;
  const unrepairableTicketsCount = maint.filter((t) => t.status === 'غير قابل للإصلاح').length;
  const pendingHandoverCount = maint.filter((t) => t.handoverStatus !== 'تم_الاستلام' && t.status !== 'غير قابل للإصلاح').length;

  // Assets Alert Calculations
  const assetCalculations = useMemo(() => {
    return localAssets.map((ast) => ({
      asset: ast,
      calc: getAssetDueStatus(ast)
    }));
  }, [localAssets]);

  const activeAlerts = useMemo(() => {
    return assetCalculations.filter((item) => item.asset.status !== 'inactive' && item.calc.isAlertActive);
  }, [assetCalculations]);

  const overdueCount = useMemo(() => {
    return assetCalculations.filter((item) => item.asset.status !== 'inactive' && item.calc.status === 'overdue').length;
  }, [assetCalculations]);

  const dueSoonCount = useMemo(() => {
    return assetCalculations.filter((item) => item.asset.status !== 'inactive' && (item.calc.status === 'due_soon' || item.calc.status === 'due_today')).length;
  }, [assetCalculations]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return maint.filter((t) => {
      // 1. Status Filter
      if (statusFilter === 'open' && (t.status === 'مغلق' || t.status === 'غير قابل للإصلاح')) return false;
      if (statusFilter !== 'all' && statusFilter !== 'open' && t.status !== statusFilter) return false;

      // 2. Handover Filter
      const isReceived = t.handoverStatus === 'تم_الاستلام';
      if (handoverFilter === 'تم_الاستلام' && !isReceived) return false;
      if (handoverFilter === 'لم_يتم_الاستلام' && isReceived) return false;

      // 3. Date Filter
      if (maintDateFilter.preset !== 'all' || maintDateFilter.startDate || maintDateFilter.endDate) {
        const ticketDate = t.isoDate || t.date || (t.createdTs ? normalizeDateToIso(t.createdTs) : '');
        if (!isDateInRange(ticketDate, maintDateFilter.startDate, maintDateFilter.endDate)) {
          return false;
        }
      }

      // 4. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const tTitle = (t.title || '').toLowerCase();
        const tLoc = (t.location || '').toLowerCase();
        const tBy = (t.by || '').toLowerCase();
        const tHandoverBy = (t.handoverBy || '').toLowerCase();
        const tNote = (t.note || '').toLowerCase();
        const tAsset = (t.assetName || t.assetCode || '').toLowerCase();
        if (
          !tTitle.includes(q) &&
          !tLoc.includes(q) &&
          !tBy.includes(q) &&
          !tHandoverBy.includes(q) &&
          !tNote.includes(q) &&
          !tAsset.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [maint, statusFilter, handoverFilter, maintDateFilter, searchQuery]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assetCalculations.filter(({ asset, calc }) => {
      if (assetCategoryFilter !== 'all' && asset.category !== assetCategoryFilter) return false;

      if (assetDueStatusFilter === 'alerts_only' && !calc.isAlertActive) return false;
      if (assetDueStatusFilter === 'overdue' && calc.status !== 'overdue') return false;
      if (assetDueStatusFilter === 'due_soon' && calc.status !== 'due_soon' && calc.status !== 'due_today') return false;
      if (assetDueStatusFilter === 'on_track' && calc.status !== 'on_track') return false;

      if (assetSearchQuery.trim()) {
        const q = assetSearchQuery.toLowerCase().trim();
        const aName = (asset.name || '').toLowerCase();
        const aCode = (asset.assetCode || '').toLowerCase();
        const aLoc = (asset.location || '').toLowerCase();
        const aTech = (asset.assignedTechnician || '').toLowerCase();
        const aNotes = (asset.notes || '').toLowerCase();
        if (!aName.includes(q) && !aCode.includes(q) && !aLoc.includes(q) && !aTech.includes(q) && !aNotes.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [assetCalculations, assetCategoryFilter, assetDueStatusFilter, assetSearchQuery]);

  // All Asset History Logs Combined
  const allHistoryLogs = useMemo(() => {
    const logs: Array<AssetMaintenanceLog & { assetName: string; assetCode: string; location: string }> = [];
    localAssets.forEach((ast) => {
      (ast.history || []).forEach((h) => {
        logs.push({
          ...h,
          assetName: ast.name,
          assetCode: ast.assetCode,
          location: ast.location
        });
      });
    });
    return logs.sort((a, b) => {
      const tsA = new Date(a.isoDate || a.date).getTime() || 0;
      const tsB = new Date(b.isoDate || b.date).getTime() || 0;
      return tsB - tsA;
    });
  }, [localAssets]);

  // Handlers for Tickets
  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('يرجى كتابة وصف العطل');
      return;
    }

    let formattedDate = today();
    if (ticketDateIso) {
      try {
        const dObj = new Date(ticketDateIso + 'T12:00:00');
        if (!isNaN(dObj.getTime())) {
          formattedDate = dObj.toLocaleDateString('ar-EG');
        }
      } catch {
        formattedDate = today();
      }
    }

    const initialSteps: MaintenanceRepairStep[] = DEFAULT_REPAIR_STEPS.map((stepTitle, idx) => ({
      id: uid(),
      title: stepTitle,
      completed: false,
      order: idx + 1
    }));

    const mntSeq = getNextDocumentSequence('MNT');
    const matchedAsset = localAssets.find((a) => a.id === linkedAssetId);

    const newTicket: MaintenanceTicket = {
      id: mntSeq,
      ticketNumber: mntSeq,
      title: title.trim(),
      location: location.trim() || matchedAsset?.location || 'المقر الرئيسي',
      priority,
      note: note.trim() || (matchedAsset ? `صيانة وقائية مرتبطة بالأصل [${matchedAsset.name} - ${matchedAsset.assetCode}]` : ''),
      status: 'جديد',
      date: formattedDate,
      isoDate: ticketDateIso || isoToday(),
      createdTs: Date.now(),
      cost: 0,
      repairSteps: initialSteps,
      currentStep: initialSteps[0]?.title || 'فحص العطل وتحديد المتطلبات',
      handoverStatus: 'لم_يتم_الاستلام',
      by: isMgr ? 'المدير' : currentRole === 'maint' ? 'الصيانة' : 'مسؤول',
      assetId: matchedAsset?.id,
      assetCode: matchedAsset?.assetCode,
      assetName: matchedAsset?.name,
      isPeriodic: !!matchedAsset
    };

    onSaveMaint([newTicket, ...maint]);
    setShowAddModal(false);
    setTitle('');
    setLocation('');
    setNote('');
    setLinkedAssetId('');
    setTicketDateIso(isoToday());
    showToast(`تم تسجيل بلاغ العطل برقم تسلسلي [${mntSeq}] وبدء مسار خطوات الإصلاح ✓`);
  };

  const handleStartRepair = (id: string) => {
    const updated = maint.map((t) => {
      if (t.id !== id) return t;
      let steps = t.repairSteps || [];
      if (steps.length === 0) {
        steps = DEFAULT_REPAIR_STEPS.map((st, idx) => ({
          id: uid(),
          title: st,
          completed: idx === 0,
          completedAt: idx === 0 ? today() : '',
          order: idx + 1
        }));
      } else {
        steps = steps.map((s, i) => (i === 0 ? { ...s, completed: true, completedAt: today() } : s));
      }
      return {
        ...t,
        status: 'قيد الإصلاح' as const,
        repairSteps: steps,
        currentStep: steps[1]?.title || steps[0]?.title
      };
    });
    onSaveMaint(updated);
    showToast('تم بدء مرحلة الإصلاح وتحديث خطوات العمل 🔧');
  };

  const handleToggleStep = (ticketId: string, stepId: string) => {
    const updated = maint.map((t) => {
      if (t.id !== ticketId) return t;
      const currentSteps = (t.repairSteps && t.repairSteps.length > 0)
        ? t.repairSteps
        : DEFAULT_REPAIR_STEPS.map((st, idx) => ({
            id: uid(),
            title: st,
            completed: false,
            order: idx + 1
          }));

      const newSteps = currentSteps.map((s) => {
        if (s.id === stepId) {
          const nextCompleted = !s.completed;
          return {
            ...s,
            completed: nextCompleted,
            completedAt: nextCompleted ? today() : ''
          };
        }
        return s;
      });

      const nextPending = newSteps.find((s) => !s.completed);
      const allCompleted = newSteps.every((s) => s.completed);

      return {
        ...t,
        repairSteps: newSteps,
        currentStep: nextPending ? nextPending.title : 'اكتملت جميع خطوات الإصلاح',
        status: allCompleted ? (t.status === 'مغلق' ? 'مغلق' : 'قيد الإصلاح') : (t.status === 'جديد' ? 'قيد الإصلاح' : t.status)
      };
    });
    onSaveMaint(updated);
    showToast('تم تحديث مرحلة الإصلاح');
  };

  const handleAddCustomStep = (ticketId: string) => {
    if (!newStepTitle.trim()) return;
    const updated = maint.map((t) => {
      if (t.id !== ticketId) return t;
      const existing = t.repairSteps || [];
      const newStep: MaintenanceRepairStep = {
        id: uid(),
        title: newStepTitle.trim(),
        completed: false,
        order: existing.length + 1
      };
      return {
        ...t,
        repairSteps: [...existing, newStep]
      };
    });
    onSaveMaint(updated);
    setNewStepTitle('');
    setActiveStepTicketId(null);
    showToast('تمت إضافة خطوة إصلاح جديدة');
  };

  const handleConfirmClose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingTicket) return;

    const costVal = parseFloat(closeCost) || 0;
    const updated = maint.map((t) => {
      if (t.id !== closingTicket.id) return t;
      const steps = (t.repairSteps || []).map((s) => ({
        ...s,
        completed: true,
        completedAt: s.completedAt || today()
      }));
      return {
        ...t,
        status: 'مغلق' as const,
        cost: costVal,
        closedTs: Date.now(),
        repairSteps: steps,
        note: closeNote.trim() ? `${t.note ? `${t.note} | ` : ''}تقرير الإغلاق: ${closeNote.trim()}` : t.note
      };
    });

    onSaveMaint(updated);

    // If ticket was linked to an asset, also append to asset history
    if (closingTicket.assetId) {
      const updatedAssets = localAssets.map((ast) => {
        if (ast.id !== closingTicket.assetId) return ast;
        const newLog: AssetMaintenanceLog = {
          id: uid(),
          date: today(),
          isoDate: isoToday(),
          cost: costVal,
          technician: closingTicket.technicianName || 'فني الصيانة',
          notes: `إتمام بلاغ صيانة [${closingTicket.ticketNumber || closingTicket.id}]: ${closingTicket.title} - ${closeNote.trim()}`,
          ticketId: closingTicket.id,
          ticketNumber: closingTicket.ticketNumber
        };
        return {
          ...ast,
          lastMaintenanceDate: isoToday(),
          history: [newLog, ...(ast.history || [])]
        };
      });
      handleUpdateAssets(updatedAssets);
    }

    setClosingTicket(null);
    setCloseNote('');
    showToast('تم إغلاق البلاغ وتسجيل تكلفة الصيانة ✓');
  };

  const handleConfirmHandover = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoverTicket) return;

    let hDate = today();
    if (handoverDateIso) {
      try {
        const dObj = new Date(handoverDateIso + 'T12:00:00');
        if (!isNaN(dObj.getTime())) {
          hDate = dObj.toLocaleDateString('ar-EG');
        }
      } catch {
        hDate = today();
      }
    }

    const recipientName = handoverRecipient.trim() || 'مسؤول القسم المعني';
    const updated = maint.map((t) =>
      t.id === handoverTicket.id
        ? {
            ...t,
            handoverStatus: 'تم_الاستلام' as const,
            handoverBy: recipientName,
            handoverDate: hDate
          }
        : t
    );

    onSaveMaint(updated);
    setHandoverTicket(null);
    setHandoverRecipient('');
    showToast(`تم تأكيد استلام وتسليم القاعة / الجهاز بنجاح بواسطة: ${recipientName} ✓`);
  };

  const handleConfirmUnrepairable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unrepairableTicket) return;
    if (!unrepairableReason.trim()) {
      showToast('يرجى كتابة سبب عدم إمكانية الإصلاح بناءً على الفني');
      return;
    }

    const tech = technicianName.trim() || 'فني الصيانة المختص';
    const reason = unrepairableReason.trim();
    const rep = technicianReport.trim();

    const updated = maint.map((t) => {
      if (t.id !== unrepairableTicket.id) return t;
      return {
        ...t,
        status: 'غير قابل للإصلاح' as const,
        unrepairableReason: reason,
        technicianName: tech,
        technicianDate: today(),
        technicianReport: rep || '',
        closedTs: Date.now()
      };
    });

    onSaveMaint(updated);
    setUnrepairableTicket(null);
    setUnrepairableReason('');
    setTechnicianName('');
    setTechnicianReport('');
    showToast('تم تسجيل قرار الفني: غير قابل للإصلاح بنجاح ⛔');
  };

  const handleReopenTicket = (ticketId: string) => {
    const updated = maint.map((t) => {
      if (t.id !== ticketId) return t;
      return {
        ...t,
        status: 'قيد الإصلاح' as const,
        closedTs: 0
      };
    });
    onSaveMaint(updated);
    showToast('تمت إعادة فتح البلاغ لمواصلة المتابعة');
  };

  const handleDeleteTicket = (id: string) => {
    setDeleteTargetTicketId(id);
  };

  const handleConfirmDeleteTicket = () => {
    if (!deleteTargetTicketId) return;
    addDeletedMaintId(deleteTargetTicketId);
    onSaveMaint(maint.filter((t) => t.id !== deleteTargetTicketId));
    setDeleteTargetTicketId(null);
    showToast('تم حذف بلاغ الصيانة بنجاح ✓');
  };

  // Helper to open Quick Ticket pre-filled from an Asset
  const handleLaunchTicketFromAsset = (ast: MaintenanceAsset) => {
    setTitle(`صيانة دورية وقائية: ${ast.name} (${ast.assetCode})`);
    setLocation(ast.location);
    setPriority('متوسط');
    setLinkedAssetId(ast.id);
    setNote(`صيانة دورية مستحقة للأصل وفقاً للجدول الزمني (${ast.periodTitle || `${ast.periodDays} يوم`}). الفني المقترح: ${ast.assignedTechnician || 'غير محدد'}`);
    setTicketDateIso(isoToday());
    setActiveSubTab('tickets');
    setShowAddModal(true);
    showToast(`تم فتح شاشة إنشاء بلاغ الصيانة للأصل: ${ast.name} 🛠️`);
  };

  // Asset Creation / Editing
  const openAddAssetModal = () => {
    setEditingAsset(null);
    setAssetName('');
    setAssetCode(`AST-${String(localAssets.length + 1).padStart(2, '0')}`);
    setAssetCategory('تكييفات_وتبريد');
    setAssetLocation('');
    setAssetPeriodDays('60');
    setAssetPeriodTitle('كل شهرين');
    setAssetLastDate(isoToday());
    
    // Default next due date = today + 60 days
    const d = new Date();
    d.setDate(d.getDate() + 60);
    setAssetNextDue(normalizeDateToIso(d) || isoToday());
    setAssetAlertDays('7');
    setAssetTech('');
    setAssetPhone('');
    setAssetEstCost('0');
    setAssetNotes('');
    setShowAddAssetModal(true);
  };

  const openEditAssetModal = (ast: MaintenanceAsset) => {
    setEditingAsset(ast);
    setAssetName(ast.name);
    setAssetCode(ast.assetCode);
    setAssetCategory(ast.category);
    setAssetLocation(ast.location);
    setAssetPeriodDays(String(ast.periodDays || 60));
    setAssetPeriodTitle(ast.periodTitle || '');
    setAssetLastDate(ast.lastMaintenanceDate || isoToday());
    setAssetNextDue(ast.nextDueDate || isoToday());
    setAssetAlertDays(String(ast.alertDaysBefore || 7));
    setAssetTech(ast.assignedTechnician || '');
    setAssetPhone(ast.vendorPhone || '');
    setAssetEstCost(String(ast.estimatedCost || 0));
    setAssetNotes(ast.notes || '');
    setShowAddAssetModal(true);
  };

  const handleSaveAssetForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName.trim()) {
      showToast('يرجى كتابة اسم الأصل');
      return;
    }

    const pDays = parseInt(assetPeriodDays, 10) || 30;
    const aDays = parseInt(assetAlertDays, 10) || 7;
    const cost = parseFloat(assetEstCost) || 0;

    // Calculate next due date if not provided
    let calcNextDue = assetNextDue;
    if (!calcNextDue && assetLastDate) {
      const d = new Date(assetLastDate + 'T12:00:00');
      d.setDate(d.getDate() + pDays);
      calcNextDue = normalizeDateToIso(d) || isoToday();
    }

    if (editingAsset) {
      const updated = localAssets.map((a) =>
        a.id === editingAsset.id
          ? {
              ...a,
              name: assetName.trim(),
              assetCode: assetCode.trim() || a.assetCode,
              category: assetCategory,
              location: assetLocation.trim(),
              periodDays: pDays,
              periodTitle: assetPeriodTitle.trim() || `${pDays} يوم`,
              lastMaintenanceDate: assetLastDate,
              nextDueDate: calcNextDue,
              alertDaysBefore: aDays,
              assignedTechnician: assetTech.trim(),
              vendorPhone: assetPhone.trim(),
              estimatedCost: cost,
              notes: assetNotes.trim(),
              updatedTs: Date.now()
            }
          : a
      );
      handleUpdateAssets(updated);
      showToast('تم تحديث بيانات الأصل وجدول الصيانة بنجاح ✓');
    } else {
      const newAsset: MaintenanceAsset = {
        id: uid(),
        name: assetName.trim(),
        assetCode: assetCode.trim() || `AST-${String(localAssets.length + 1).padStart(2, '0')}`,
        category: assetCategory,
        location: assetLocation.trim() || 'المقر الرئيسي',
        periodDays: pDays,
        periodTitle: assetPeriodTitle.trim() || `${pDays} يوم`,
        lastMaintenanceDate: assetLastDate,
        nextDueDate: calcNextDue || isoToday(),
        alertDaysBefore: aDays,
        assignedTechnician: assetTech.trim(),
        vendorPhone: assetPhone.trim(),
        estimatedCost: cost,
        notes: assetNotes.trim(),
        status: 'active',
        createdTs: Date.now()
      };
      handleUpdateAssets([newAsset, ...localAssets]);
      showToast('تمت إضافة الأصل الجديد إلى جدول الصيانة الدورية ✓');
    }

    setShowAddAssetModal(false);
  };

  // Complete Periodic Maintenance Modal & Handler
  const openCompleteAssetMaintModal = (ast: MaintenanceAsset) => {
    setCompletingAssetMaint(ast);
    setCompleteMaintDate(isoToday());
    setCompleteMaintCost(String(ast.estimatedCost || 0));
    setCompleteMaintTech(ast.assignedTechnician || '');
    setCompleteMaintNotes('تم تنفيذ الفحص الدوري الشامل واستبدال القطع الاستهلاكية');
    setAutoAdvanceNextDue(true);
  };

  const handleConfirmCompleteAssetMaint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingAssetMaint) return;

    const costVal = parseFloat(completeMaintCost) || 0;
    const executedDateIso = completeMaintDate || isoToday();

    // Compute next due date = executedDateIso + periodDays
    const d = new Date(executedDateIso + 'T12:00:00');
    d.setDate(d.getDate() + (completingAssetMaint.periodDays || 30));
    const nextDueCalculated = normalizeDateToIso(d) || isoToday();

    const newLog: AssetMaintenanceLog = {
      id: uid(),
      date: formatDateDisplay(executedDateIso),
      isoDate: executedDateIso,
      cost: costVal,
      technician: completeMaintTech.trim() || completingAssetMaint.assignedTechnician || 'فني الصيانة',
      notes: completeMaintNotes.trim(),
      performedBy: isMgr ? 'المدير العام' : 'مسؤول الصيانة'
    };

    const updated = localAssets.map((ast) => {
      if (ast.id !== completingAssetMaint.id) return ast;
      return {
        ...ast,
        lastMaintenanceDate: executedDateIso,
        nextDueDate: autoAdvanceNextDue ? nextDueCalculated : ast.nextDueDate,
        history: [newLog, ...(ast.history || [])],
        updatedTs: Date.now()
      };
    });

    handleUpdateAssets(updated);
    setCompletingAssetMaint(null);
    showToast(`✅ تم تسجيل إتمام الصيانة الدورية للأصل [${completingAssetMaint.name}] وتجديد الموعد القادم بنجاح`);
  };

  const handleDeleteAsset = (id: string) => {
    setDeleteTargetAssetId(id);
  };

  const handleConfirmDeleteAsset = () => {
    if (!deleteTargetAssetId) return;
    const updated = localAssets.filter((a) => a.id !== deleteTargetAssetId);
    handleUpdateAssets(updated);
    setDeleteTargetAssetId(null);
    showToast('تم حذف الأصل من جدول الصيانة الدورية');
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header & Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#075073] tracking-tight flex items-center gap-2">
            <span>🛠️ منظومة الصيانة والأصول والتنبيهات الدورية</span>
            {activeAlerts.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white animate-pulse">
                <BellRing className="w-3.5 h-3.5" />
                <span>{activeAlerts.length} تنبيه دوري مستحق</span>
              </span>
            )}
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            متابعة بلاغات الأعطال الفنية، وجداول الصيانة الوقائية الدورية للأصول مع الإشعار التلقائي عند اقتراب المواعيد
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isMgr && (
            <button
              onClick={() => onExportCSV(activeSubTab === 'assets' ? 'assets' : 'maint')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-2xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير Excel</span>
            </button>
          )}

          {activeSubTab === 'assets' ? (
            <button
              onClick={openAddAssetModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة أصل وجدول صيانة</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setTitle('');
                setLocation('');
                setNote('');
                setLinkedAssetId('');
                setTicketDateIso(isoToday());
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ بلاغ عطل جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* 🔔 PROMINENT AUTOMATIC MAINTENANCE ALERT BANNER & QUICK ACTION CARDS */}
      {activeAlerts.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border-2 border-amber-400/60 shadow-md space-y-3.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md animate-bounce">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-amber-950 flex items-center gap-2">
                  <span>تنبيه نظام الصيانة الوقائية: اقتراب أو حلول موعد صيانة دورية لأصول المركز</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-mono font-bold">
                    {activeAlerts.length} أصل مطلوب متابعته
                  </span>
                </h3>
                <p className="text-xs text-amber-900/80 font-medium">
                  تم إرسال إشعارات تلقائية لنظام التنبيهات. يمكنك إطلاق بلاغ صيانة مباشر أو تسجيل إتمام الصيانة وتجديد الموعد بنقرة واحدة.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveSubTab('assets')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <span>عرض كافة الأصول بالجدول</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            </button>
          </div>

          {/* Quick Alert Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeAlerts.map(({ asset, calc }) => (
              <div
                key={asset.id}
                className="bg-white/95 p-3.5 rounded-2xl border border-amber-300/80 shadow-xs space-y-2.5 hover:border-amber-400 transition-all flex flex-col justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <div>
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-mono">
                        {asset.assetCode}
                      </span>
                      <h4 className="text-xs sm:text-sm font-black text-stone-900 mt-1 leading-snug">
                        {asset.name}
                      </h4>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${calc.statusBadgeColor}`}>
                      {calc.statusLabel}
                    </span>
                  </div>

                  <div className="text-[11.5px] text-stone-600 space-y-0.5 font-medium">
                    <div className="flex items-center gap-1 text-stone-500">
                      <span>📍 الموقع:</span>
                      <strong className="text-stone-800">{asset.location}</strong>
                    </div>
                    <div className="flex items-center gap-1 text-stone-500">
                      <span>📅 موعد الاستحقاق:</span>
                      <strong className="text-rose-700 font-mono">{calc.formattedDueDate}</strong>
                    </div>
                    {asset.assignedTechnician && (
                      <div className="flex items-center gap-1 text-stone-500">
                        <span>👤 الفني المختص:</span>
                        <span className="text-stone-700">{asset.assignedTechnician}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => handleLaunchTicketFromAsset(asset)}
                    className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-bold bg-[#075073] hover:bg-[#03151F] text-white transition-all shadow-2xs cursor-pointer"
                    title="فتح بلاغ صيانة ومسار خطوات إصلاح فوري لهذا الأصل"
                  >
                    <Wrench className="w-3 h-3 text-amber-300" />
                    <span>⚡ فتح بلاغ للأصل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openCompleteAssetMaintModal(asset)}
                    className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-2xs cursor-pointer"
                    title="تسجيل إتمام الصيانة الدورية وتجديد موعد الدورة القادمة تلقائياً"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-200" />
                    <span>✓ تم الإنجاز والتجديد</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main SubTabs Selector */}
      <div className="flex items-center gap-2 p-1.5 bg-stone-200/80 rounded-2xl max-w-xl">
        <button
          type="button"
          onClick={() => setActiveSubTab('tickets')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'tickets'
              ? 'bg-white text-[#075073] shadow-sm'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/40'
          }`}
        >
          <Wrench className="w-4 h-4 text-amber-600" />
          <span>بلاغات الأعطال الفنية</span>
          <span className="text-xs px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-700 font-mono">
            {maint.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('assets')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'assets'
              ? 'bg-white text-[#075073] shadow-sm'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/40'
          }`}
        >
          <Building className="w-4 h-4 text-blue-600" />
          <span>الأصول والصيانة الدورية</span>
          <span className={`text-xs px-1.5 py-0.2 rounded-full font-mono font-bold ${activeAlerts.length > 0 ? 'bg-rose-500 text-white' : 'bg-stone-100 text-stone-700'}`}>
            {localAssets.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'history'
              ? 'bg-white text-[#075073] shadow-sm'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/40'
          }`}
        >
          <History className="w-4 h-4 text-emerald-600" />
          <span>سجل الصيانات المنفذة</span>
          <span className="text-xs px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-700 font-mono">
            {allHistoryLogs.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/*                SUBTAB 1: TICKETS & REPAIR STEPS VIEW                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'tickets' && (
        <div className="space-y-4">
          {/* Quick Status KPI Filter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setHandoverFilter('all');
              }}
              className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                statusFilter === 'all' && handoverFilter === 'all'
                  ? 'bg-[#075073] text-white border-[#075073] shadow-sm'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <div className="text-[11px] font-bold opacity-80">كافة البلاغات</div>
              <div className={`text-xl font-black font-mono mt-0.5 ${statusFilter === 'all' && handoverFilter === 'all' ? 'text-white' : 'text-[#075073]'}`}>
                {maint.length}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('open');
                setHandoverFilter('all');
              }}
              className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                statusFilter === 'open'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-amber-300 hover:bg-amber-50/50'
              }`}
            >
              <div className="text-[11px] font-bold opacity-80">قيد التنفيذ / جاري</div>
              <div className={`text-xl font-black font-mono mt-0.5 ${statusFilter === 'open' ? 'text-white' : 'text-amber-600'}`}>
                {openTicketsCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('مغلق');
                setHandoverFilter('all');
              }}
              className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                statusFilter === 'مغلق'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/50'
              }`}
            >
              <div className="text-[11px] font-bold opacity-80">تم الإصلاح بنجاح</div>
              <div className={`text-xl font-black font-mono mt-0.5 ${statusFilter === 'مغلق' ? 'text-white' : 'text-emerald-600'}`}>
                {closedTicketsCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('غير قابل للإصلاح');
                setHandoverFilter('all');
              }}
              className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                statusFilter === 'غير قابل للإصلاح'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-rose-300 hover:bg-rose-50/50'
              }`}
            >
              <div className="text-[11px] font-bold opacity-80">غير قابل للإصلاح</div>
              <div className={`text-xl font-black font-mono mt-0.5 ${statusFilter === 'غير قابل للإصلاح' ? 'text-white' : 'text-rose-600'}`}>
                {unrepairableTicketsCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setHandoverFilter('لم_يتم_الاستلام');
              }}
              className={`p-3 rounded-2xl border text-right transition-all cursor-pointer col-span-2 sm:col-span-1 ${
                handoverFilter === 'لم_يتم_الاستلام'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-purple-300 hover:bg-purple-50/50'
              }`}
            >
              <div className="text-[11px] font-bold opacity-80">بانتظار التسليم</div>
              <div className={`text-xl font-black font-mono mt-0.5 ${handoverFilter === 'لم_يتم_الاستلام' ? 'text-white' : 'text-purple-600'}`}>
                {pendingHandoverCount}
              </div>
            </button>
          </div>

          {/* Advanced Filter Toolbar */}
          <div className="space-y-3">
            <DateFilterBar
              value={maintDateFilter}
              onChange={setMaintDateFilter}
              label="فلترة تواريخ بلاغات الصيانة"
            />

            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-bold text-[#075073]">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-[#075073]" />
                  <span>خيارات التصفية والبحث في البلاغات:</span>
                </div>
                <span className="text-stone-400 font-normal text-[11px]">
                  عرض {filteredTickets.length} من أصل {maint.length} بلاغ
                </span>
              </div>

              {/* Filters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {/* Status Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">حالة البلاغ</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="w-full py-2 px-2.5 rounded-xl border border-stone-200 bg-stone-50 font-bold text-stone-700 focus:border-[#075073] focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="all">كل الحالات (مفتوح ومغلق)</option>
                    <option value="open">🔓 المفتوح فقط (جديد + قيد الإصلاح)</option>
                    <option value="جديد">🔴 جديد فقط</option>
                    <option value="قيد الإصلاح">🟡 قيد الإصلاح فقط</option>
                    <option value="مغلق">🟢 مغلق وتم الإصلاح</option>
                    <option value="غير قابل للإصلاح">⛔ غير قابل للإصلاح (قرار الفني)</option>
                  </select>
                </div>

                {/* Handover Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">حالة الاستلام والتسليم</label>
                  <select
                    value={handoverFilter}
                    onChange={(e) => setHandoverFilter(e.target.value as any)}
                    className="w-full py-2 px-2.5 rounded-xl border border-stone-200 bg-stone-50 font-bold text-stone-700 focus:border-[#075073] focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="all">الكل (المستلم وغير المستلم)</option>
                    <option value="تم_الاستلام">✅ تم الاستلام والتسليم للقسم</option>
                    <option value="لم_يتم_الاستلام">⏳ لم يتم الاستلام بعد (قيد الإجراء)</option>
                  </select>
                </div>

                {/* Search Box */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">بحث سريع</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث بالعطل، الموقع، الفني، الأصل..."
                      className="w-full py-2 pl-3 pr-8 rounded-xl border border-stone-200 bg-stone-50 text-xs focus:border-[#075073] focus:bg-white focus:outline-none"
                    />
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-2.5" />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute left-2.5 top-2.5 text-stone-400 hover:text-stone-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tickets List */}
          <div className="space-y-3">
            {filteredTickets.map((t) => {
              const isClosed = t.status === 'مغلق';
              const isUnrepairable = t.status === 'غير قابل للإصلاح';
              const isInProgress = t.status === 'قيد الإصلاح';
              const isUrgent = t.priority === 'عاجل';
              const isMedium = t.priority === 'متوسط';
              const isReceived = t.handoverStatus === 'تم_الاستلام';
              const isExpanded = !!expandedTicketIds[t.id];

              const steps: MaintenanceRepairStep[] = (t.repairSteps && t.repairSteps.length > 0)
                ? t.repairSteps
                : DEFAULT_REPAIR_STEPS.map((st, idx) => ({
                    id: `def-${idx}`,
                    title: st,
                    completed: isClosed ? true : idx === 0 && isInProgress,
                    order: idx + 1
                  }));

              const completedStepsCount = steps.filter((s) => s.completed).length;
              const progressPercent = Math.round((completedStepsCount / Math.max(1, steps.length)) * 100);

              return (
                <div
                  key={t.id}
                  className={`p-4 bg-white rounded-2xl border transition-all shadow-2xs space-y-3 ${
                    isUnrepairable
                      ? 'border-rose-300 bg-rose-50/15 border-r-4 border-r-rose-600'
                      : isClosed
                      ? 'border-stone-200 bg-stone-50/40'
                      : isUrgent
                      ? 'border-rose-300 border-r-4 border-r-rose-600'
                      : 'border-stone-200 border-r-4 border-r-amber-500'
                  }`}
                >
                  {/* Top Row */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-base">
                        {isUrgent ? '🔴' : isMedium ? '🟡' : '🟢'}
                      </span>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-stone-900">{t.title}</h3>
                          <DocumentSequenceBadge code={t.ticketNumber || t.id} type="MNT" size="sm" />
                          {t.assetName && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              <Building className="w-3 h-3 text-blue-600" />
                              <span>أصل: {t.assetName}</span>
                            </span>
                          )}
                        </div>
                        {t.location && (
                          <span className="text-[11px] text-stone-500 font-medium">
                            الموقع: <strong className="text-stone-700">{t.location}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {!isUnrepairable && (
                        isReceived ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <UserCheck className="w-3 h-3 text-emerald-600" />
                            <span>تم الاستلام ({t.handoverBy || 'معتمد'})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>لم يتم الاستلام بعد</span>
                          </span>
                        )
                      )}

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          isUnrepairable
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : isClosed
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : isInProgress
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}
                      >
                        {isUnrepairable && <AlertOctagon className="w-3 h-3 text-rose-600" />}
                        <span>{t.status === 'غير قابل للإصلاح' ? 'غير قابل للإصلاح (قرار فني)' : t.status}</span>
                      </span>
                    </div>
                  </div>

                  {/* Meta details */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 font-medium bg-stone-50/70 p-2.5 rounded-xl border border-stone-100">
                    <span>⚡ الأولوية: <strong className="text-stone-700">{t.priority}</strong></span>
                    <span>📅 تاريخ البلاغ: <strong className="text-stone-700 font-mono">{t.date}</strong></span>
                    <span>👤 بواسطة: <strong className="text-stone-700">{t.by}</strong></span>
                    {t.handoverDate && !isUnrepairable && (
                      <span>🤝 تاريخ التسليم: <strong className="text-emerald-700 font-mono">{t.handoverDate}</strong></span>
                    )}
                    {isClosed && t.cost > 0 && (
                      <span>💰 تكلفة الإصلاح: <strong className="text-[#075073] font-mono">{t.cost.toLocaleString('ar-EG')} ج.م</strong></span>
                    )}
                    {isClosed && t.closedTs && t.createdTs && (
                      <span>⏱️ زمن الإنجاز: <strong className="text-emerald-700 font-mono">{fmtDuration(t.closedTs - t.createdTs)}</strong></span>
                    )}
                  </div>

                  {t.note && (
                    <div className="p-2.5 bg-stone-50 rounded-xl text-xs text-stone-600 leading-relaxed border border-stone-200/60">
                      {t.note}
                    </div>
                  )}

                  {/* Callout if Marked Unrepairable */}
                  {isUnrepairable && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 font-black text-rose-900">
                          <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>قرار الفني: غير قابل للإصلاح (تالف / غير مجدي فنياً)</span>
                        </div>
                        {t.technicianDate && (
                          <span className="text-[11px] text-rose-700 font-mono font-bold bg-rose-100/80 px-2 py-0.5 rounded-md">
                            تاريخ المعاينة: {t.technicianDate}
                          </span>
                        )}
                      </div>
                      {t.unrepairableReason && (
                        <div className="text-rose-950 pr-5 leading-relaxed font-medium bg-white/70 p-2.5 rounded-xl border border-rose-100">
                          <strong className="text-rose-900">سبب عدم إمكانية الإصلاح بناءً على الفني:</strong> {t.unrepairableReason}
                        </div>
                      )}
                      {t.technicianName && (
                        <div className="text-rose-800 text-[11.5px] pr-5 flex items-center gap-3 flex-wrap">
                          <span>الفني المختص: <strong className="font-bold text-stone-900">{t.technicianName}</strong></span>
                          {t.technicianReport && (
                            <span>| تقرير الفحص: <strong className="text-stone-700">{t.technicianReport}</strong></span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Repair Steps Progress & Interactive Checklist */}
                  {!isUnrepairable && (
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#075073]">
                          <Layers className="w-4 h-4 text-amber-600" />
                          <span>خطوات الإصلاح الفني:</span>
                          <span className="font-mono text-stone-600 text-[11px]">
                            ({completedStepsCount} من {steps.length} مكتملة — {progressPercent}%)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleExpand(t.id)}
                          className="text-[11px] font-bold text-stone-600 hover:text-[#075073] flex items-center gap-0.5 cursor-pointer"
                        >
                          <span>{isExpanded ? 'طي الخطوات' : 'عرض وتعديل الخطوات'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 transition-all duration-300 ${
                            progressPercent === 100 ? 'bg-emerald-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      {/* Steps Details */}
                      {isExpanded ? (
                        <div className="pt-2 space-y-2">
                          <div className="space-y-1.5 divide-y divide-stone-100">
                            {steps.map((st, idx) => (
                              <div
                                key={st.id || idx}
                                className="pt-1.5 flex items-start justify-between gap-2 text-xs"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleToggleStep(t.id, st.id)}
                                  className="flex items-start gap-2 text-right hover:opacity-80 transition-opacity cursor-pointer flex-1"
                                >
                                  {st.completed ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                  ) : (
                                    <Square className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                                  )}
                                  <span className={st.completed ? 'line-through text-stone-400 font-medium' : 'font-bold text-stone-800'}>
                                    {idx + 1}. {st.title}
                                  </span>
                                </button>
                                {st.completedAt && (
                                  <span className="text-[10px] text-emerald-700 font-mono bg-emerald-50 px-1.5 py-0.5 rounded">
                                    تم: {st.completedAt}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Add Custom Step */}
                          {activeStepTicketId === t.id ? (
                            <div className="flex gap-2 pt-2">
                              <input
                                type="text"
                                value={newStepTitle}
                                onChange={(e) => setNewStepTitle(e.target.value)}
                                placeholder="وصف الخطوة الإضافية للإصلاح..."
                                className="flex-1 py-1.5 px-3 rounded-lg border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#075073]"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddCustomStep(t.id)}
                                className="py-1.5 px-3 rounded-lg bg-[#075073] hover:bg-[#03151F] text-white text-xs font-bold transition-all cursor-pointer"
                              >
                                حفظ الخطوة
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveStepTicketId(null);
                                  setNewStepTitle('');
                                }}
                                className="py-1.5 px-2.5 rounded-lg bg-stone-200 text-stone-700 text-xs cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActiveStepTicketId(t.id)}
                              className="text-[11px] font-bold text-amber-800 hover:text-amber-900 pt-1 block cursor-pointer"
                            >
                              + إضافة خطوة إصلاح مخصصة لهذا البلاغ
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-stone-500 flex items-center justify-between">
                          <span>
                            المرحلة الحالية:{' '}
                            <strong className="text-stone-800">
                              {steps.find((s) => !s.completed)?.title || 'جميع الخطوات مكتملة'}
                            </strong>
                          </span>
                          <span className="text-[10.5px] text-stone-400">انقر على &quot;عرض وتعديل الخطوات&quot; لمتابعة بنود الفحص</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    {t.status === 'جديد' && (
                      <button
                        onClick={() => handleStartRepair(t.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-all cursor-pointer shadow-2xs"
                      >
                        <Wrench className="w-3.5 h-3.5 text-amber-600" />
                        <span>بدء الإصلاح والمراحل</span>
                      </button>
                    )}

                    {!isUnrepairable && !isReceived && (
                      <button
                        onClick={() => {
                          setHandoverTicket(t);
                          setHandoverRecipient('');
                          setHandoverDateIso(isoToday());
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 transition-all cursor-pointer shadow-2xs"
                        title="تأكيد استلام وتسليم القاعة/الجهاز للمسؤول بعد الإصلاح"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span>تأكيد الاستلام والتسليم للقسم</span>
                      </button>
                    )}

                    {!isUnrepairable && isReceived && (
                      <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>مُسلّم إلى: {t.handoverBy}</span>
                      </span>
                    )}

                    {!isClosed && !isUnrepairable && (
                      <>
                        <button
                          onClick={() => {
                            setClosingTicket(t);
                            setCloseCost(String(t.cost || 0));
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>اكتمال الإصلاح (إغلاق البلاغ)</span>
                        </button>

                        <button
                          onClick={() => {
                            setUnrepairableTicket(t);
                            setUnrepairableReason('');
                            setTechnicianName('');
                            setTechnicianReport('');
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 transition-all cursor-pointer shadow-2xs"
                          title="تسجيل أن هذا العطل غير قابل للإصلاح بناءً على تقرير الفني"
                        >
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                          <span>قرار الفني: غير قابل للإصلاح ⛔</span>
                        </button>
                      </>
                    )}

                    {isUnrepairable && (
                      <button
                        onClick={() => handleReopenTicket(t.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-stone-600" />
                        <span>إعادة فتح البلاغ للمتابعة</span>
                      </button>
                    )}

                    {isMgr && (
                      <button
                        onClick={() => handleDeleteTicket(t.id)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-all cursor-pointer mr-auto"
                        title="حذف البلاغ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredTickets.length === 0 && (
              <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-stone-200 text-stone-400 space-y-2">
                <div className="text-3xl">🛠️</div>
                <div className="text-sm font-bold text-[#075073]">لا توجد بلاغات صيانة مطابقة للفلتر المحدد</div>
                <div className="text-xs text-stone-400 max-w-sm mx-auto">
                  جرب تغيير خيارات الفلتر أو اضغط على &quot;+ بلاغ عطل جديد&quot;
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/*        SUBTAB 2: ASSETS & PREVENTIVE MAINTENANCE SCHEDULES               */}
      {/* ========================================================================= */}
      {activeSubTab === 'assets' && (
        <div className="space-y-4">
          {/* Top Asset KPI Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
              <div className="text-stone-500 text-[11px] font-bold">إجمالي الأصول المسجلة</div>
              <div className="text-2xl font-black text-[#075073] font-mono mt-0.5">{localAssets.length}</div>
              <div className="text-[10px] text-stone-400 mt-0.5">أجهزة ومعدات خاضعة للجدول</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-rose-200 shadow-2xs">
              <div className="text-rose-600 text-[11px] font-bold">صيانات متأخرة</div>
              <div className="text-2xl font-black text-rose-600 font-mono mt-0.5">{overdueCount}</div>
              <div className="text-[10px] text-rose-500 mt-0.5">تجاوزت الموعد المحدد</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-2xs">
              <div className="text-amber-600 text-[11px] font-bold">مستحقة وقريبة الموعد</div>
              <div className="text-2xl font-black text-amber-600 font-mono mt-0.5">{dueSoonCount}</div>
              <div className="text-[10px] text-amber-500 mt-0.5">ضمن نافذة التنبيه التلقائي</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 shadow-2xs">
              <div className="text-emerald-600 text-[11px] font-bold">سارية ومنتظمة</div>
              <div className="text-2xl font-black text-emerald-600 font-mono mt-0.5">
                {localAssets.filter((a) => getAssetDueStatus(a).status === 'on_track').length}
              </div>
              <div className="text-[10px] text-emerald-500 mt-0.5">وفق الجدول الزمني</div>
            </div>
          </div>

          {/* Filter Toolbar for Assets */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-bold text-[#075073]">
              <div className="flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-[#075073]" />
                <span>تصفية وبحث سجل الأصول والصيانة الوقائية:</span>
              </div>
              <span className="text-stone-400 font-normal text-[11px]">
                عرض {filteredAssets.length} من أصل {localAssets.length} أصل
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {/* Category Filter */}
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">تصنيف الأصل</label>
                <select
                  value={assetCategoryFilter}
                  onChange={(e) => setAssetCategoryFilter(e.target.value)}
                  className="w-full py-2 px-2.5 rounded-xl border border-stone-200 bg-stone-50 font-bold text-stone-700 focus:border-[#075073] focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="all">كل التصنيفات والأجهزة</option>
                  {ASSET_CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Due Status Filter */}
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">حالة موعد الصيانة</label>
                <select
                  value={assetDueStatusFilter}
                  onChange={(e) => setAssetDueStatusFilter(e.target.value as any)}
                  className="w-full py-2 px-2.5 rounded-xl border border-stone-200 bg-stone-50 font-bold text-stone-700 focus:border-[#075073] focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="all">كل الحالات</option>
                  <option value="alerts_only">🔔 التنبيهات المستحقة فقط (متأخر + يقترب)</option>
                  <option value="overdue">⚠️ المتأخرة فقط</option>
                  <option value="due_soon">⏳ يقترب موعدها فقط</option>
                  <option value="on_track">✅ السارية والمنتظمة فقط</option>
                </select>
              </div>

              {/* Search */}
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">بحث سريع في الأصول</label>
                <div className="relative">
                  <input
                    type="text"
                    value={assetSearchQuery}
                    onChange={(e) => setAssetSearchQuery(e.target.value)}
                    placeholder="ابحث باسم الأصل، الكود، الموقع، الفني..."
                    className="w-full py-2 pl-3 pr-8 rounded-xl border border-stone-200 bg-stone-50 text-xs focus:border-[#075073] focus:bg-white focus:outline-none"
                  />
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-2.5" />
                  {assetSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAssetSearchQuery('')}
                      className="absolute left-2.5 top-2.5 text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Assets Cards & Responsive Table */}
          <div className="space-y-3">
            {isLoadingAssets && localAssets.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <div className="w-8 h-8 border-4 border-[#075073] border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div className="text-sm font-bold text-[#075073]">جاري تحميل البيانات والأصول من السحابة...</div>
                <div className="text-xs text-stone-400">يرجى الانتظار لحظات ريثما يتم مزامنة الأصول وجدولة الصيانة الوقائية</div>
              </div>
            ) : (
              <>
                {filteredAssets.map(({ asset, calc }) => (
              <div
                key={asset.id}
                className={`p-4 bg-white rounded-2xl border transition-all shadow-2xs space-y-3.5 ${
                  calc.status === 'overdue'
                    ? 'border-rose-300 border-r-4 border-r-rose-600 bg-rose-50/10'
                    : calc.status === 'due_today' || calc.status === 'due_soon'
                    ? 'border-amber-300 border-r-4 border-r-amber-500 bg-amber-50/10'
                    : 'border-stone-200 border-r-4 border-r-emerald-500'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-stone-100 flex items-center justify-center text-lg shrink-0">
                      {ASSET_CATEGORIES.find((c) => c.key === asset.category)?.icon || '🏢'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-800">
                          {asset.assetCode}
                        </span>
                        <h3 className="text-sm sm:text-base font-black text-stone-900">{asset.name}</h3>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 font-bold border border-blue-200">
                          {ASSET_CATEGORIES.find((c) => c.key === asset.category)?.label || asset.category}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">
                        📍 الموقع: <strong className="text-stone-700">{asset.location}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-3 py-1 rounded-full font-bold border ${calc.statusBadgeColor}`}>
                      {calc.statusLabel}
                    </span>
                  </div>
                </div>

                {/* Schedule Parameters & Contacts Box */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs bg-stone-50 p-3 rounded-xl border border-stone-200/70">
                  <div>
                    <span className="text-stone-400 block text-[10.5px]">دورة الصيانة الدورية:</span>
                    <strong className="text-stone-800 font-bold">
                      كل {asset.periodDays} يوم {asset.periodTitle ? `(${asset.periodTitle})` : ''}
                    </strong>
                  </div>

                  <div>
                    <span className="text-stone-400 block text-[10.5px]">تاريخ آخر صيانة منفذة:</span>
                    <strong className="text-stone-800 font-mono">
                      {asset.lastMaintenanceDate ? formatDateDisplay(asset.lastMaintenanceDate) : '—'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-stone-400 block text-[10.5px]">موعد الصيانة القادم:</span>
                    <strong className={`font-mono font-bold ${calc.isAlertActive ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {calc.formattedDueDate}
                    </strong>
                  </div>

                  <div>
                    <span className="text-stone-400 block text-[10.5px]">الفني / شركة الصيانة:</span>
                    <div className="flex items-center gap-1">
                      <strong className="text-stone-800">{asset.assignedTechnician || 'غير محدد'}</strong>
                      {asset.vendorPhone && (
                        <a
                          href={`tel:${asset.vendorPhone}`}
                          className="text-[#075073] hover:underline font-mono text-[11px] inline-flex items-center gap-0.5"
                          title="اتصال هاتفي"
                        >
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{asset.vendorPhone}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {asset.notes && (
                  <div className="text-xs text-stone-600 bg-white p-2.5 rounded-xl border border-stone-100 leading-relaxed">
                    📝 <strong>تعليمات وملاحظات الصيانة:</strong> {asset.notes}
                  </div>
                )}

                {/* Actions Toolbar */}
                <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-stone-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleLaunchTicketFromAsset(asset)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-2xs transition-all cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5 text-amber-300" />
                      <span>⚡ فتح بلاغ صيانة للأصل</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openCompleteAssetMaintModal(asset)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>✓ تسجيل إتمام الصيانة وتجديد الموعد</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditAssetModal(asset)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 transition-all cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-stone-600" />
                      <span>تعديل الجدول</span>
                    </button>
                  </div>

                  {isMgr && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAsset(asset.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-all cursor-pointer"
                      title="حذف الأصل من السجل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

                {filteredAssets.length === 0 && (
                  <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-stone-200 text-stone-400 space-y-2">
                    <div className="text-3xl">🏢</div>
                    <div className="text-sm font-bold text-[#075073]">لا توجد أصول مطابقة للفلتر المحدد</div>
                    <div className="text-xs text-stone-400 max-w-sm mx-auto">
                      جرب تغيير التصنيف أو حالة الاستحقاق أو اضغط على &quot;+ إضافة أصل وجدول صيانة&quot;
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/*        SUBTAB 3: ASSET MAINTENANCE HISTORY LOG VIEW                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm sm:text-base font-black text-[#075073]">
                  سجل الصيانات الدورية والوقائية المكتملة للأصول
                </h3>
              </div>
              <span className="text-xs text-stone-400">
                إجمالي العمليات المسجلة: {allHistoryLogs.length} عملية صيانة
              </span>
            </div>

            {/* Responsive Table */}
            <div className="overflow-x-auto max-w-full -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-right text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-stone-50 text-stone-700 border-b border-stone-200 font-black">
                    <th className="py-2.5 px-3">التاريخ</th>
                    <th className="py-2.5 px-3">الأصل / المعدة</th>
                    <th className="py-2.5 px-3">الموقع</th>
                    <th className="py-2.5 px-3">الفني / الشركة</th>
                    <th className="py-2.5 px-3">التكلفة (ج.م)</th>
                    <th className="py-2.5 px-3">المنفذ / المسؤول</th>
                    <th className="py-2.5 px-3">تقرير وملاحظات الصيانة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {allHistoryLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-stone-800">
                        {log.date}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-stone-900">
                        <span className="font-mono text-[11px] bg-stone-100 px-1.5 py-0.5 rounded ml-1 text-stone-600">
                          {log.assetCode}
                        </span>
                        <span>{log.assetName}</span>
                      </td>
                      <td className="py-2.5 px-3 text-stone-600">{log.location}</td>
                      <td className="py-2.5 px-3 font-medium text-stone-800">{log.technician || '—'}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                        {log.cost ? `${log.cost.toLocaleString('ar-EG')} ج.م` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-stone-500">{log.performedBy || 'الصيانة'}</td>
                      <td className="py-2.5 px-3 text-stone-600 max-w-xs truncate" title={log.notes}>
                        {log.notes || '—'}
                      </td>
                    </tr>
                  ))}
                  {allHistoryLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-stone-400">
                        لا توجد سجلات صيانة دورية مكتملة حتى الآن
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/*                              MODALS                                       */}
      {/* ========================================================================= */}

      {/* Add / Edit Ticket Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-200 max-h-[90dvh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#075073]/10 text-[#075073] flex items-center justify-center font-bold">
                  🛠️
                </div>
                <h3 className="text-base font-black text-[#075073]">تسجيل بلاغ صيانة وعطل فني جديد</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">وصف العطل / المشكلة *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: تكييف غرفة المحاضرات لا يبرد / عطل بالمصعد"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Linked Asset (Optional) */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ربط بأصل مسجل (اختياري)</label>
                <select
                  value={linkedAssetId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    setLinkedAssetId(selId);
                    const matched = localAssets.find((a) => a.id === selId);
                    if (matched) {
                      if (!location) setLocation(matched.location);
                      if (!title) setTitle(`صيانة دورية وقائية: ${matched.name}`);
                    }
                  }}
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:border-[#075073] focus:outline-none cursor-pointer"
                >
                  <option value="">-- بدون ربط بأصل محدد --</option>
                  {localAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.assetCode}] {a.name} — {a.location}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الموقع أو القاعة</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="مثال: الدور الثاني — قاعة 4"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ تسجيل البلاغ</label>
                  <input
                    type="date"
                    value={ticketDateIso}
                    onChange={(e) => setTicketDateIso(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">درجة الأولوية</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:border-[#075073] focus:outline-none"
                >
                  <option value="عاجل">🔴 عاجل (توقف عمل فوري / طارئ)</option>
                  <option value="متوسط">🟡 متوسط</option>
                  <option value="منخفض">🟢 منخفض</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات أو تفاصيل إضافية</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظات العطل، رقم التواصل مع الفني..."
                  className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                💡 سيتم إنشاء مسار خطوات الإصلاح تلقائياً (فحص العطل، توفير قطع الغيار، الإصلاح الفني، الاختبار، وتأكيد التسليم).
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer"
                >
                  تسجيل البلاغ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Asset Modal */}
      {showAddAssetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-200 max-h-[90dvh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                  🏢
                </div>
                <h3 className="text-base font-black text-[#075073]">
                  {editingAsset ? 'تعديل بيانات الأصل وجدول الصيانة' : 'إضافة أصل جديد لجدول الصيانة الدورية'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddAssetModal(false)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssetForm} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">اسم الأصل / المعدة *</label>
                  <input
                    type="text"
                    required
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    placeholder="مثال: تكييف القاعة الرئيسية 1"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-[#075073] focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">كود الأصل (Tag/Code)</label>
                  <input
                    type="text"
                    value={assetCode}
                    onChange={(e) => setAssetCode(e.target.value)}
                    placeholder="مثال: AC-01"
                    className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تصنيف الأصل</label>
                  <select
                    value={assetCategory}
                    onChange={(e) => setAssetCategory(e.target.value as AssetCategory)}
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 focus:border-[#075073] focus:outline-none cursor-pointer"
                  >
                    {ASSET_CATEGORIES.map((cat) => (
                      <option key={cat.key} value={cat.key}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الموقع / القاعة / الدور</label>
                  <input
                    type="text"
                    value={assetLocation}
                    onChange={(e) => setAssetLocation(e.target.value)}
                    placeholder="مثال: الدور الأول — قاعة 2"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>

              {/* Schedule Timing */}
              <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-200/80 space-y-2.5">
                <h4 className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>إعدادات وتكرار الصيانة الدورية والتنبيه</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-blue-900 mb-1">الدورة بالأيام</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={assetPeriodDays}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAssetPeriodDays(val);
                        const n = parseInt(val, 10);
                        if (n === 30) setAssetPeriodTitle('شهري');
                        else if (n === 60) setAssetPeriodTitle('كل شهرين');
                        else if (n === 90) setAssetPeriodTitle('ربع سنوي');
                        else if (n === 180) setAssetPeriodTitle('نصف سنوي');
                        else if (n === 365) setAssetPeriodTitle('سنوي');
                        else if (n > 0) setAssetPeriodTitle(`كل ${n} يوم`);
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl border border-blue-200 bg-white font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-blue-900 mb-1">عنوان الدورة</label>
                    <input
                      type="text"
                      value={assetPeriodTitle}
                      onChange={(e) => setAssetPeriodTitle(e.target.value)}
                      placeholder="مثال: كل شهرين"
                      className="w-full py-1.5 px-2.5 rounded-xl border border-blue-200 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-blue-900 mb-1">تنبيه قبل (أيام)</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={assetAlertDays}
                      onChange={(e) => setAssetAlertDays(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-xl border border-blue-200 bg-white font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-blue-900 mb-1">تاريخ آخر صيانة منفذة</label>
                    <input
                      type="date"
                      value={assetLastDate}
                      onChange={(e) => {
                        const lDate = e.target.value;
                        setAssetLastDate(lDate);
                        if (lDate) {
                          const d = new Date(lDate + 'T12:00:00');
                          d.setDate(d.getDate() + (parseInt(assetPeriodDays, 10) || 60));
                          setAssetNextDue(normalizeDateToIso(d) || isoToday());
                        }
                      }}
                      className="w-full py-1.5 px-2.5 rounded-xl border border-blue-200 bg-white font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-blue-900 mb-1">موعد الصيانة القادم المستحق</label>
                    <input
                      type="date"
                      value={assetNextDue}
                      onChange={(e) => setAssetNextDue(e.target.value)}
                      className="w-full py-1.5 px-2.5 rounded-xl border border-blue-200 bg-white font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Vendor & Cost */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الفني / الشركة المسؤولة</label>
                  <input
                    type="text"
                    value={assetTech}
                    onChange={(e) => setAssetTech(e.target.value)}
                    placeholder="مثال: م/ أحمد — شركة كاريير"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">هاتف التواصل</label>
                  <input
                    type="text"
                    value={assetPhone}
                    onChange={(e) => setAssetPhone(e.target.value)}
                    placeholder="010XXXXXXXX"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs font-mono focus:border-[#075073] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">التكلفة التقديرية (ج.م)</label>
                  <input
                    type="number"
                    step="any"
                    value={assetEstCost}
                    onChange={(e) => setAssetEstCost(e.target.value)}
                    placeholder="0"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات فنية / بنود الفحص</label>
                <textarea
                  rows={2}
                  value={assetNotes}
                  onChange={(e) => setAssetNotes(e.target.value)}
                  placeholder="مثال: تنظيف فلاتر، فحص مستوى الزيوت، اختبار الضغط..."
                  className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAssetModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#075073] hover:bg-[#03151F] transition-all shadow-md cursor-pointer"
                >
                  {editingAsset ? 'حفظ التعديلات' : 'إضافة الأصل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Asset Maintenance Modal */}
      {completingAssetMaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border-t-4 border-emerald-600 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">✓ تسجيل إتمام الصيانة الدورية</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  الأصل: <strong>{completingAssetMaint.name}</strong> ({completingAssetMaint.assetCode})
                </p>
              </div>
              <button
                onClick={() => setCompletingAssetMaint(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCompleteAssetMaint} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ إتمام الصيانة</label>
                <input
                  type="date"
                  required
                  value={completeMaintDate}
                  onChange={(e) => setCompleteMaintDate(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">التكلفة الفعلية المنصرفة (ج.م)</label>
                <input
                  type="number"
                  step="any"
                  value={completeMaintCost}
                  onChange={(e) => setCompleteMaintCost(e.target.value)}
                  placeholder="0"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">الفني / الشركة القائمة بالتنفيذ</label>
                <input
                  type="text"
                  value={completeMaintTech}
                  onChange={(e) => setCompleteMaintTech(e.target.value)}
                  placeholder="اسم الفني أو الشركة"
                  className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">تقرير وملاحظات الإنجاز</label>
                <textarea
                  rows={2}
                  value={completeMaintNotes}
                  onChange={(e) => setCompleteMaintNotes(e.target.value)}
                  placeholder="تفاصيل الأعمال التي تمت، القطع المستبدلة..."
                  className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-950 font-medium">
                <input
                  type="checkbox"
                  id="autoAdvance"
                  checked={autoAdvanceNextDue}
                  onChange={(e) => setAutoAdvanceNextDue(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                />
                <label htmlFor="autoAdvance" className="cursor-pointer">
                  تجديد وتمديد موعد الصيانة القادم تلقائياً بمقدار ({completingAssetMaint.periodDays} يوم)
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingAssetMaint(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md cursor-pointer"
                >
                  تأكيد وحفظ الإنجاز
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Ticket Modal */}
      {closingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-emerald-600 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">✓ إغلاق بلاغ الصيانة واكتمال الإصلاح</h3>
                <p className="text-xs text-stone-500 mt-0.5">{closingTicket.title}</p>
              </div>
              <button
                onClick={() => setClosingTicket(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmClose} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  تكلفة الإصلاح الإجمالية (ج.م) — قطع غيار / فني خارجي (اختياري)
                </label>
                <input
                  type="number"
                  step="any"
                  value={closeCost}
                  onChange={(e) => setCloseCost(e.target.value)}
                  placeholder="0"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-[#075073] focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">تقرير الإغلاق وملاحظات الفني</label>
                <textarea
                  rows={2}
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder="تفاصيل الإصلاح الفني الذي تم، القطع التي تم استبدالها..."
                  className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-[#075073] focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClosingTicket(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md cursor-pointer"
                >
                  تأكيد الإغلاق واكتمال الإصلاح
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Handover Modal */}
      {handoverTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#03151F]/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-blue-600 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-[#075073]">🤝 تأكيد استلام وتسليم القاعة / الجهاز</h3>
                <p className="text-xs text-stone-500 mt-0.5">{handoverTicket.title}</p>
              </div>
              <button
                onClick={() => setHandoverTicket(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmHandover} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  اسم المستلم (المسؤول الذي استلم القاعة أو الجهاز) *
                </label>
                <input
                  type="text"
                  required
                  value={handoverRecipient}
                  onChange={(e) => setHandoverRecipient(e.target.value)}
                  placeholder="مثال: أ/ محمد (مشرف القاعات) / مسؤول الاستقبال"
                  className="w-full py-2.5 px-3 rounded-xl border border-stone-200 text-xs font-bold focus:border-blue-600 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">تاريخ الاستلام الفعلي</label>
                <input
                  type="date"
                  value={handoverDateIso}
                  onChange={(e) => setHandoverDateIso(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHandoverTicket(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-md cursor-pointer"
                >
                  تأكيد الاستلام والتسليم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unrepairable Modal */}
      {unrepairableTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border-t-4 border-rose-600 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-rose-700 flex items-center gap-1.5">
                  <AlertOctagon className="w-5 h-5 text-rose-600" />
                  <span>قرار الفني: غير قابل للإصلاح (تالف)</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">{unrepairableTicket.title}</p>
              </div>
              <button
                onClick={() => setUnrepairableTicket(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmUnrepairable} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  سبب عدم إمكانية الإصلاح بناءً على الفني *
                </label>
                <textarea
                  required
                  rows={2}
                  value={unrepairableReason}
                  onChange={(e) => setUnrepairableReason(e.target.value)}
                  placeholder="مثال: احتراق الموتور الداخلي بالكامل وتكلفة التغيير تتجاوز قيمة شراء جديد..."
                  className="w-full py-2.5 px-3 rounded-xl border border-rose-200 text-xs focus:border-rose-600 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">اسم الفني المختص</label>
                  <input
                    type="text"
                    value={technicianName}
                    onChange={(e) => setTechnicianName(e.target.value)}
                    placeholder="مثال: م/ محمود الصاوي"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-rose-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">تقرير الفحص</label>
                  <input
                    type="text"
                    value={technicianReport}
                    onChange={(e) => setTechnicianReport(e.target.value)}
                    placeholder="رقم تقرير المعاينة"
                    className="w-full py-2 px-3 rounded-xl border border-stone-200 text-xs focus:border-rose-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUnrepairableTicket(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-md cursor-pointer"
                >
                  تأكيد قرار الفني
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Ticket Confirmation Modal */}
      {deleteTargetTicketId && (
        <ConfirmModal
          isOpen={true}
          title="حذف بلاغ الصيانة"
          message="هل أنت متأكد من حذف هذا البلاغ نهائياً من النظام؟"
          confirmLabel="نعم، احذف البلاغ"
          cancelLabel="تراجع"
          onConfirm={handleConfirmDeleteTicket}
          onCancel={() => setDeleteTargetTicketId(null)}
          variant="danger"
        />
      )}

      {/* Delete Asset Confirmation Modal */}
      {deleteTargetAssetId && (
        <ConfirmModal
          isOpen={true}
          title="حذف الأصل من الصيانة الدورية"
          message="هل أنت متأكد من حذف هذا الأصل وجدوله الزمني من النظام؟"
          confirmLabel="نعم، احذف الأصل"
          cancelLabel="تراجع"
          onConfirm={handleConfirmDeleteAsset}
          onCancel={() => setDeleteTargetAssetId(null)}
          variant="danger"
        />
      )}
    </div>
  );
};
