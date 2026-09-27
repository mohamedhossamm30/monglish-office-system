import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MobileLine, RoleKey } from '../types';
import {
  uid,
  normalizeEgyptPhone,
  parseTelecomRow,
  convertArabicIndicDigits,
  cleanPersonName,
  isCleanPersonName,
  today,
  cleanEgyptianNationalId,
  isValidEgyptianNationalId,
  getNationalIdMetadata,
  deduplicateLines
} from '../utils/storage';
import {
  AlertTriangle,
  ArrowDownLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  X,
  Filter,
  Layers,
  ArrowUpDown,
  RefreshCw,
  Copy,
  CreditCard,
  Check,
  Users
} from 'lucide-react';

interface MobileLinesViewProps {
  lines: MobileLine[];
  currentRole: RoleKey;
  onSaveLines: (newLines: MobileLine[]) => void;
  onExportCSV: (type: string) => void;
  onOpenExcelImport: (type: 'lines') => void;
  showToast: (msg: string) => void;
}

export const MobileLinesView: React.FC<MobileLinesViewProps> = ({
  lines = [],
  currentRole,
  onSaveLines,
  onExportCSV,
  onOpenExcelImport,
  showToast
}) => {
  const canEdit = currentRole === 'manager' || currentRole === 'reception';
  const [searchQuery, setSearchQuery] = useState('');

  // Helper to determine whether a line is assigned to a genuine employee (not a code or service tag)
  const isLineAssigned = (l: MobileLine): boolean => {
    return Boolean(l.employee && isCleanPersonName(l.employee));
  };
  const getLineEmployeeDisplay = (l: MobileLine): string | null => {
    if (l.employee && isCleanPersonName(l.employee)) {
      return l.employee.trim();
    }
    return null;
  };

  // Bulk Selection State
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);

  // Add Line Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addNumber, setAddNumber] = useState('');
  const [addEmployee, setAddEmployee] = useState('');
  const [addNationalId, setAddNationalId] = useState('');
  const [addPlan, setAddPlan] = useState('');
  const [addCost, setAddCost] = useState('0');
  const [addNote, setAddNote] = useState('');

  // Edit Line Modal
  const [editLine, setEditLine] = useState<MobileLine | null>(null);
  const [editEmployee, setEditEmployee] = useState('');
  const [editNationalId, setEditNationalId] = useState('');
  const [editPlan, setEditPlan] = useState('');
  const [editCost, setEditCost] = useState('0');
  const [editStatus, setEditStatus] = useState<'نشط' | 'معطل'>('نشط');
  const [editNote, setEditNote] = useState('');

  // Dedicated Employee Sheet Sync Modal State
  const [showEmployeeSyncModal, setShowEmployeeSyncModal] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncSearch, setSyncSearch] = useState('');
  const [syncPreview, setSyncPreview] = useState<{
    items: {
      number: string;
      employeeName?: string;
      nationalId?: string;
      hasExistingLine: boolean;
      existingEmployee?: string;
      existingNationalId?: string;
      actionType: 'UPDATE_MATCH' | 'CREATE_NEW';
    }[];
    matchedCount: number;
    nidCount: number;
    noNidCount: number;
    newCount: number;
  } | null>(null);

  // Smart Reconciliation Modal State
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconcileMode, setReconcileMode] = useState<'pdf' | 'excel'>('pdf');
  const [reconLoading, setReconLoading] = useState(false);
  const [reconStatus, setReconStatus] = useState('');
  const [reconModalTab, setReconModalTab] = useState<'MATCHED' | 'UNKNOWN' | 'MISSING' | 'OVERVIEW'>('MATCHED');
  const [reconFilter, setReconFilter] = useState<'ALL' | 'MATCHED' | 'MISSING' | 'DIFF_COST'>('ALL');
  const [lineStatusFilter, setLineStatusFilter] = useState<'ALL' | 'ACTIVE' | 'STOCK' | 'DISABLED'>('ALL');
  const [reconSearch, setReconSearch] = useState('');

  const [reconResults, setReconResults] = useState<{
    billNumbers: { number: string; amount?: number; name?: string; nationalId?: string }[];
    matched: {
      number: string;
      systemLine: MobileLine;
      billAmount?: number;
      billName?: string;
      billNationalId?: string;
    }[];
    unknownInBill: { number: string; amount?: number; name?: string; nationalId?: string }[];
    missingFromBill: MobileLine[];
  } | null>(() => {
    try {
      const saved = localStorage.getItem('monglish_last_recon');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.unknownInBill)) {
          parsed.unknownInBill = parsed.unknownInBill.map((item: any) => ({
            ...item,
            name: isCleanPersonName(item.name) ? item.name : undefined,
            nationalId: cleanEgyptianNationalId(item.nationalId) || undefined
          }));
        }
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  const activeLines = lines.filter((l) => l.status !== 'معطل' && isLineAssigned(l));
  const stockLines = lines.filter((l) => l.status !== 'معطل' && !isLineAssigned(l));
  const disabledLines = lines.filter((l) => l.status === 'معطل');
  const totalMonthlyCost = lines
    .filter((l) => l.status !== 'معطل')
    .reduce((a, l) => a + (l.monthlyCost || 0), 0);

  // Detect duplicate phone numbers in system
  const duplicateCount = React.useMemo(() => {
    const seen = new Set<string>();
    let dupes = 0;
    lines.forEach((l) => {
      const norm = normalizeEgyptPhone(l.number);
      if (norm) {
        if (seen.has(norm)) {
          dupes++;
        } else {
          seen.add(norm);
        }
      }
    });
    return dupes;
  }, [lines]);

  const handleMergeAllDuplicates = () => {
    const clean = deduplicateLines(lines);
    onSaveLines(clean);
    showToast(`✓ تم دمج وتنظيف كافة الأرقام المكررة بنجاح! تم اختصار ${lines.length} إلى ${clean.length} خط فريد بدون تكرار.`);
  };

  // Reconciliation lookup maps
  const matchedMap = useMemo(() => {
    const map = new Map<string, { billAmount?: number; systemLine: MobileLine }>();
    if (reconResults) {
      reconResults.matched.forEach((m) => {
        map.set(normalizeEgyptPhone(m.number), m);
      });
    }
    return map;
  }, [reconResults]);

  const missingSet = useMemo(() => {
    const set = new Set<string>();
    if (reconResults) {
      reconResults.missingFromBill.forEach((l) => {
        set.add(normalizeEgyptPhone(l.number));
      });
    }
    return set;
  }, [reconResults]);

  // Count lines with cost variance
  const diffCostCount = useMemo(() => {
    return reconResults
      ? reconResults.matched.filter(
          (m) => m.billAmount !== undefined && m.billAmount !== (m.systemLine.monthlyCost || 0)
        ).length
      : 0;
  }, [reconResults]);

  // Pagination State for high performance
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(50);

  // Reset page when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, lineStatusFilter, reconFilter]);

  const filteredLines = useMemo(() => {
    let qClean = '';
    let qNormPhone = '';
    if (searchQuery.trim()) {
      let qNormDigits = searchQuery.trim();
      const arDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      for (let i = 0; i <= 9; i++) {
        qNormDigits = qNormDigits.replaceAll(arDigits[i], String(i));
      }
      qClean = qNormDigits.toLowerCase();
      qNormPhone = normalizeEgyptPhone(qNormDigits);
    }

    return lines.filter((l) => {
      // 1. Line Status Filter (Active, Stock, Disabled)
      if (lineStatusFilter === 'ACTIVE' && (l.status === 'معطل' || !isLineAssigned(l))) return false;
      if (lineStatusFilter === 'STOCK' && (l.status === 'معطل' || isLineAssigned(l))) return false;
      if (lineStatusFilter === 'DISABLED' && l.status !== 'معطل') return false;

      // 2. Reconciliation Filter
      const norm = normalizeEgyptPhone(l.number);
      if (reconFilter === 'MATCHED' && !matchedMap.has(norm)) return false;
      if (reconFilter === 'MISSING' && !missingSet.has(norm)) return false;
      if (reconFilter === 'DIFF_COST') {
        const match = matchedMap.get(norm);
        if (!match || match.billAmount === undefined || match.billAmount === (l.monthlyCost || 0)) return false;
      }

      // 3. Search Query
      if (!qClean) return true;

      const matchNum = l.number.includes(qClean) || (qNormPhone.length >= 3 && norm.includes(qNormPhone));
      const matchEmp = isLineAssigned(l) && (l.employee || '').toLowerCase().includes(qClean);
      const matchNid = Boolean(l.nationalId && l.nationalId.includes(qClean));
      const matchPlan = (l.plan || '').toLowerCase().includes(qClean);
      const matchNote = (l.note || '').toLowerCase().includes(qClean);

      return matchNum || matchEmp || matchNid || matchPlan || matchNote;
    });
  }, [lines, lineStatusFilter, reconFilter, searchQuery, matchedMap, missingSet]);

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredLines.length / (pageSize as number)));
  const currentSafePage = Math.min(currentPage, totalPages);

  const paginatedLines = useMemo(() => {
    if (pageSize === 'all') return filteredLines;
    const start = (currentSafePage - 1) * (pageSize as number);
    return filteredLines.slice(start, start + (pageSize as number));
  }, [filteredLines, currentSafePage, pageSize]);

  const isAllSelected = filteredLines.length > 0 && filteredLines.every((l) => selectedLineIds.includes(l.id));

  const [customSelectCount, setCustomSelectCount] = useState('');

  const handleSelectCount = (count: number) => {
    const slice = filteredLines.slice(0, count).map((l) => l.id);
    setSelectedLineIds(slice);
    showToast(`تم تحديد أول ${slice.length} خط بنجاح`);
  };

  const handlePrintLines = () => {
    window.print();
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLineIds([]);
    } else {
      setSelectedLineIds(filteredLines.map((l) => l.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (!selectedLineIds.length) return;
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedLineIds.length} خطوط محددة نهائياً؟`)) return;
    const remaining = lines.filter((l) => !selectedLineIds.includes(l.id));
    onSaveLines(remaining);
    setSelectedLineIds([]);
    showToast(`تم حذف ${selectedLineIds.length} خط بنجاح ✓`);
  };

  const selectedLineLineCount = selectedLineIds.length;

  const handleBulkSetStatus = (status: 'نشط' | 'معطل') => {
    if (!selectedLineIds.length) return;
    const updated = lines.map((l) =>
      selectedLineIds.includes(l.id) ? { ...l, status } : l
    );
    onSaveLines(updated);
    setSelectedLineIds([]);
    showToast(`تم تحديث حالة ${selectedLineIds.length} خط إلى "${status}" ✓`);
  };

  const handleCreateLine = (e: React.FormEvent) => {
    e.preventDefault();
    const num = normalizeEgyptPhone(addNumber);
    if (!num) {
      showToast('يرجى إدخال رقم هاتف محمول مصري صحيح');
      return;
    }

    if (lines.some((l) => normalizeEgyptPhone(l.number) === num)) {
      showToast('هذا الرقم مسجل بالفعل بالنظام!');
      return;
    }

    let cleanNid: string | undefined = undefined;
    if (addNationalId.trim()) {
      const validNid = cleanEgyptianNationalId(addNationalId);
      if (!validNid) {
        showToast('⚠️ الرقم القومي يجب أن يتكون من 14 رقماً مصرياً صحيحاً يبدأ بـ 2 أو 3');
        return;
      }
      cleanNid = validNid;
    }

    const cleanEmp = isCleanPersonName(addEmployee) ? addEmployee.trim() : undefined;
    const newLine: MobileLine = {
      id: uid(),
      number: num,
      employee: cleanEmp,
      nationalId: cleanNid,
      plan: addPlan.trim() || undefined,
      monthlyCost: parseFloat(addCost) || 0,
      status: 'نشط',
      note: addNote.trim() || undefined
    };

    onSaveLines([newLine, ...lines]);
    setShowAddModal(false);
    setAddNumber('');
    setAddEmployee('');
    setAddNationalId('');
    setAddPlan('');
    setAddCost('0');
    setAddNote('');
    showToast('تمت إضافة خط الموبايل بنجاح ✓');
  };

  const handleOpenEdit = (line: MobileLine) => {
    setEditLine(line);
    setEditEmployee(isCleanPersonName(line.employee) ? line.employee! : '');
    setEditNationalId(line.nationalId || '');
    setEditPlan(line.plan || '');
    setEditCost(String(line.monthlyCost || 0));
    setEditStatus(line.status || 'نشط');
    setEditNote(line.note || '');
  };

  const handleUpdateLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLine) return;

    let cleanNid: string | undefined = undefined;
    if (editNationalId.trim()) {
      const validNid = cleanEgyptianNationalId(editNationalId);
      if (!validNid) {
        showToast('⚠️ الرقم القومي يجب أن يتكون من 14 رقماً مصرياً صحيحاً يبدأ بـ 2 أو 3');
        return;
      }
      cleanNid = validNid;
    }

    const cleanEmp = isCleanPersonName(editEmployee) ? editEmployee.trim() : undefined;
    const updated = lines.map((l) =>
      l.id === editLine.id
        ? {
            ...l,
            employee: cleanEmp,
            nationalId: cleanNid,
            plan: editPlan.trim() || undefined,
            monthlyCost: parseFloat(editCost) || 0,
            status: editStatus,
            note: editNote.trim() || undefined
          }
        : l
    );

    onSaveLines(updated);
    setEditLine(null);
    showToast('تم تعديل بيانات الخط بنجاح ✓');
  };

  const handleDeleteLine = (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الخط نهائياً؟')) return;
    onSaveLines(lines.filter((l) => l.id !== id));
    setEditLine(null);
    showToast('تم حذف الخط بنجاح');
  };

  // Smart Multi-Page PDF Reconciliation with Zero Hallucination
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReconLoading(true);
    setReconStatus('جاري قراءة ملف الفاتورة واستخراج الجداول والبيانات بدقة عالية...');

    try {
      const win = window as any;
      if (!win.pdfjsLib) {
        throw new Error('مكتبة PDF.js غير متوفرة بالمتصفح');
      }

      const arrayBuf = await file.arrayBuffer();
      const pdf = await win.pdfjsLib.getDocument({ data: arrayBuf }).promise;

      const extractedItems: { number: string; amount?: number; name?: string }[] = [];
      const seenNumbers = new Set<string>();

      // Known fixed service numbers, hotlines, and call centers to strictly exclude
      const excludedNumbers = new Set<string>([
        '888',
        '16888',
        '0225292000',
        '0225292001',
        '0225292002',
        '0225292003',
        '0225224000',
        '0225292004'
      ]);

      // Phase 1: Pre-scan all pages to collect non-phone identifiers from headers/summaries
      // (e.g. Account Number, Invoice Number, Tax ID, Commercial Registration, IBAN, Landlines)
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        let fullPageStr = textContent.items.map((it: any) => it.str).join(' ');
        fullPageStr = convertArabicIndicDigits(fullPageStr);

        // Account number patterns (رقم الحساب / كود العميل / Account No)
        const accRegex = /(?:رقم الحساب|حساب رقم|كود العميل|رقم العميل|Account\s*(?:No|Number)?|Customer\s*(?:No|Code|ID)?)[\s:=#]+([0-9.\-_]{4,25})/gi;
        let accM: RegExpExecArray | null;
        while ((accM = accRegex.exec(fullPageStr)) !== null) {
          const norm = normalizeEgyptPhone(accM[1]);
          if (norm) excludedNumbers.add(norm);
          const digits = accM[1].replace(/\D/g, '');
          if (digits) excludedNumbers.add(digits);
        }

        // Invoice number patterns (رقم الفاتورة / Invoice No / Bill No)
        const invRegex = /(?:رقم الفاتورة|فاتورة رقم|إشعار رقم|Invoice\s*(?:No|Number)?|Bill\s*(?:No|Number)?)[\s:=#]+([0-9A-Za-z.\-_]{4,25})/gi;
        let invM: RegExpExecArray | null;
        while ((invM = invRegex.exec(fullPageStr)) !== null) {
          const norm = normalizeEgyptPhone(invM[1]);
          if (norm) excludedNumbers.add(norm);
          const digits = invM[1].replace(/\D/g, '');
          if (digits) excludedNumbers.add(digits);
        }

        // Tax registration / Commercial registration
        const taxRegex = /(?:رقم التسجيل الضريبي|البطاقة الضريبية|السجل التجاري|Tax\s*ID|CR\s*No)[\s:=#]+([0-9.\-_]{4,25})/gi;
        let taxM: RegExpExecArray | null;
        while ((taxM = taxRegex.exec(fullPageStr)) !== null) {
          const digits = taxM[1].replace(/\D/g, '');
          if (digits) excludedNumbers.add(digits);
        }
      }

      // Pre-index existing system phone numbers for fast verification
      const existingSystemNumbers = new Set(
        lines.map((l) => normalizeEgyptPhone(l.number)).filter(Boolean)
      );

      // Helper to validate genuine Egyptian mobile number
      const isValidEgyptMobile = (num: string): boolean => {
        if (!num || num.length !== 11) return false;
        if (excludedNumbers.has(num)) return false;
        if (!/^01[0125]\d{8}$/.test(num)) return false;

        // Check for diversity (prevent dummy repetitions like 01000000000)
        const unique = new Set(num.split('')).size;
        if (unique < 4) return false;
        return true;
      };

      // Phase 2: Page-by-page row-based table reconstruction
      for (let p = 1; p <= pdf.numPages; p++) {
        setReconStatus(`جاري فحص الصفحة (${p} من ${pdf.numPages}) ومطابقة سطور الفاتورة بدقة...`);
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1.0 });
        const pageHeight = viewport.height || 842;

        const textContent = await page.getTextContent();
        const items = textContent.items as Array<{
          str: string;
          transform: number[]; // [a, b, c, d, x, y]
          width?: number;
          height?: number;
        }>;

        // Group items into visual horizontal rows by vertical y-coordinate (tolerance 3.5 points)
        // Skip header margin (top 85pt) and footer margin (bottom 55pt) where invoice IDs, tax info, and terms reside
        const rowBuckets: { y: number; items: typeof items }[] = [];
        for (const item of items) {
          const str = (item.str || '').trim();
          if (!str) continue;
          const y = item.transform[5];

          // Exclude header and footer banner areas
          if (y > pageHeight - 85 || y < 55) continue;

          const bucket = rowBuckets.find((b) => Math.abs(b.y - y) <= 3.5);
          if (bucket) {
            bucket.items.push(item);
          } else {
            rowBuckets.push({ y, items: [item] });
          }
        }

        // Sort rows top-to-bottom (y descending in PDF coordinate system)
        rowBuckets.sort((a, b) => b.y - a.y);

        for (const bucket of rowBuckets) {
          // Sort items in this visual row left-to-right (x ascending)
          bucket.items.sort((a, b) => a.transform[4] - b.transform[4]);
          const rowTextJoined = bucket.items.map((it) => it.str).join(' ');
          const convertedRowText = convertArabicIndicDigits(rowTextJoined);

          // Skip header rows or summary rows
          if (
            /رقم الحساب|Account|رقم الفاتورة|Invoice|البطاقة الضريبية|Tax\s*ID|السجل التجاري|الإجمالي العام|Total Due/i.test(
              convertedRowText
            )
          ) {
            continue;
          }

          // Find candidate phone numbers in this row using strict standalone boundary:
          // In Vodafone bills, phone is 010xxxxxxxx, or 10xxxxxxxx in column, or prefixed with 2010/+2010
          const phoneRegex = /(?<![\d.])(?:(?:\+?20|0020|20)?)(0?1[0125]\d{8})(?![\d.])/g;
          let match: RegExpExecArray | null;

          while ((match = phoneRegex.exec(convertedRowText)) !== null) {
            const rawNum = match[1];
            const fullNum = rawNum.startsWith('0') ? rawNum : '0' + rawNum;

            // Reject if this match is part of a date pattern (e.g. 01/10/2024 or 2024-10-01)
            const matchIndex = match.index;
            const surrounding = convertedRowText.substring(
              Math.max(0, matchIndex - 5),
              Math.min(convertedRowText.length, matchIndex + match[0].length + 5)
            );
            if (/[\/\-]\d{2,4}/.test(surrounding) || /\d{2,4}[\/\-]/.test(surrounding)) {
              continue;
            }

            if (isValidEgyptMobile(fullNum) && !seenNumbers.has(fullNum)) {
              seenNumbers.add(fullNum);

              // Extract row amount: look for currency numbers with decimal points or valid charges in this row
              let detectedAmount: number | undefined;
              const numericTokens = convertedRowText.match(/\b\d+(?:\.\d{1,2})?\b/g) || [];
              const potentialAmounts: number[] = [];

              for (const tok of numericTokens) {
                // Ignore tokens that equal the phone number, year, or small integers like 1, 2
                if (tok === fullNum || tok === rawNum || tok.length >= 8) continue;
                if (tok === '2024' || tok === '2025' || tok === '2026' || tok === '2027') continue;
                const val = parseFloat(tok);
                if (!isNaN(val) && val > 0 && val < 25000) {
                  potentialAmounts.push(val);
                }
              }

              // Prioritize amounts with explicit decimals (e.g. 150.00), else take row total
              const decimalAmount = potentialAmounts.find((a) => !Number.isInteger(a));
              if (decimalAmount !== undefined) {
                detectedAmount = decimalAmount;
              } else if (potentialAmounts.length > 0) {
                detectedAmount = potentialAmounts[potentialAmounts.length - 1];
              }

              // NOTE: Vodafone invoices DO NOT contain employee names.
              // To avoid displaying garbled font codes, glyphs, or internal service tags,
              // we strictly do NOT extract an employee name from the PDF invoice.
              extractedItems.push({
                number: fullNum,
                amount: detectedAmount,
                name: undefined
              });
            }

            if (match.index === phoneRegex.lastIndex) {
              phoneRegex.lastIndex++;
            }
          }
        }

        // Secondary Pass: Only for strictly standalone 010 numbers on this page
        // (Ensures no lines are missed if rendered in non-standard table layout)
        const middleItems = items.filter(
          (it) => it.transform[5] <= pageHeight - 85 && it.transform[5] >= 55
        );
        const wholePageConverted = convertArabicIndicDigits(
          middleItems.map((it) => it.str).join(' ')
        );
        const pagePhoneRegex = /(?<![\d.])(?:(?:\+?20|0020|20)?)(010\d{8})(?![\d.])/g;
        let pMatch: RegExpExecArray | null;

        while ((pMatch = pagePhoneRegex.exec(wholePageConverted)) !== null) {
          const rawNum = pMatch[1];
          const fullNum = rawNum.startsWith('0') ? rawNum : '0' + rawNum;

          // Reject dates
          const pIndex = pMatch.index;
          const surrounding = wholePageConverted.substring(
            Math.max(0, pIndex - 5),
            Math.min(wholePageConverted.length, pIndex + pMatch[0].length + 5)
          );
          if (/[\/\-]\d{2,4}/.test(surrounding) || /\d{2,4}[\/\-]/.test(surrounding)) {
            continue;
          }

          if (isValidEgyptMobile(fullNum) && !seenNumbers.has(fullNum)) {
            seenNumbers.add(fullNum);
            extractedItems.push({ number: fullNum, name: undefined });
          }

          if (pMatch.index === pagePhoneRegex.lastIndex) {
            pagePhoneRegex.lastIndex++;
          }
        }
      }

      if (!extractedItems.length) {
        setReconStatus('لم يتم العثور على أرقام موبايل مصرية صالحة في ملف الفاتورة. تأكد من أن الملف نصي يحتوي على جداول الخطوط وليس صورة ممسوحة ضوئياً.');
        setReconLoading(false);
        return;
      }

      processReconciliation(extractedItems);
    } catch (err: any) {
      setReconStatus(`خطأ أثناء معالجة الفاتورة: ${err.message || String(err)}`);
    } finally {
      setReconLoading(false);
    }
  };

  // Dedicated Employee Sheet Sync: Matches strictly by phone number, assigns employee name, and imports National ID if present (non-blocking if absent)
  const handleEmployeeSyncUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncLoading(true);
    setSyncStatus('جاري قراءة شيت الموظفين واستخراج أرقام الهواتف وأسماء الموظفين والأرقام القومية...');
    setSyncPreview(null);

    try {
      const xlsxLib = await import('xlsx');
      if (!xlsxLib || !xlsxLib.read) {
        throw new Error('مكتبة Excel غير متوفرة');
      }

      const arrayBuf = await file.arrayBuffer();
      const wb = xlsxLib.read(arrayBuf, { type: 'array' });

      const rawRows: any[] = [];
      wb.SheetNames.forEach((sName) => {
        const sheet = wb.Sheets[sName];
        if (sheet) {
          const rows: any[] = xlsxLib.utils.sheet_to_json(sheet, { defval: '' });
          if (Array.isArray(rows)) {
            rawRows.push(...rows);
          }
        }
      });

      if (!rawRows.length) {
        setSyncStatus('الملف فارغ أو لا يحتوي على صفوف بيانات.');
        setSyncLoading(false);
        return;
      }

      // Map existing lines by normalized phone
      const existingMap = new Map<string, MobileLine>();
      lines.forEach((l) => {
        const norm = normalizeEgyptPhone(l.number);
        if (norm && !existingMap.has(norm)) {
          existingMap.set(norm, l);
        }
      });

      // Group sheet entries by phone number (primary match key)
      const sheetEntriesMap = new Map<
        string,
        { number: string; employee?: string; nationalId?: string; plan?: string; cost?: number }
      >();

      for (const row of rawRows) {
        const parsed = parseTelecomRow(row);
        if (parsed.number) {
          const norm = normalizeEgyptPhone(parsed.number);
          if (norm) {
            const cleanEmp = cleanPersonName(parsed.employee) || undefined;
            const cleanNid = cleanEgyptianNationalId(parsed.nationalId) || undefined;

            if (sheetEntriesMap.has(norm)) {
              const prev = sheetEntriesMap.get(norm)!;
              if (!prev.employee && cleanEmp) prev.employee = cleanEmp;
              if (!prev.nationalId && cleanNid) prev.nationalId = cleanNid;
              if (!prev.cost && parsed.amount) prev.cost = parsed.amount;
              if (!prev.plan && parsed.plan) prev.plan = parsed.plan;
            } else {
              sheetEntriesMap.set(norm, {
                number: norm,
                employee: cleanEmp,
                nationalId: cleanNid,
                plan: parsed.plan || undefined,
                cost: parsed.amount || undefined
              });
            }
          }
        }
      }

      const sheetEntries = Array.from(sheetEntriesMap.values());

      if (!sheetEntries.length) {
        setSyncStatus('لم نتمكن من استخراج أي أرقام هواتف صالحة من الشيت. تأكد من وجود عمود أرقام الهواتف المحمولة.');
        setSyncLoading(false);
        return;
      }

      const previewItems = sheetEntries.map((entry) => {
        const existing = existingMap.get(entry.number);
        return {
          number: entry.number,
          employeeName: entry.employee,
          nationalId: entry.nationalId,
          hasExistingLine: Boolean(existing),
          existingEmployee: existing?.employee,
          existingNationalId: existing?.nationalId,
          actionType: existing ? ('UPDATE_MATCH' as const) : ('CREATE_NEW' as const)
        };
      });

      const matchedCount = previewItems.filter((it) => it.hasExistingLine).length;
      const nidCount = previewItems.filter((it) => Boolean(it.nationalId)).length;
      const noNidCount = previewItems.filter((it) => !it.nationalId).length;
      const newCount = previewItems.filter((it) => !it.hasExistingLine).length;

      setSyncPreview({
        items: previewItems,
        matchedCount,
        nidCount,
        noNidCount,
        newCount
      });
      setSyncStatus('');
    } catch (err: any) {
      setSyncStatus(`خطأ أثناء معالجة الشيت: ${err.message || String(err)}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleApplyEmployeeSync = () => {
    if (!syncPreview || !syncPreview.items.length) return;

    const sheetMap = new Map<string, { employee?: string; nationalId?: string }>();
    syncPreview.items.forEach((it) => {
      sheetMap.set(it.number, {
        employee: it.employeeName,
        nationalId: it.nationalId
      });
    });

    const updatedExisting = lines.map((line) => {
      const norm = normalizeEgyptPhone(line.number);
      if (sheetMap.has(norm)) {
        const item = sheetMap.get(norm)!;
        return {
          ...line,
          employee: item.employee || line.employee,
          nationalId: item.nationalId || line.nationalId,
          status: 'نشط' as const
        };
      }
      return line;
    });

    // Handle new lines that were in the sheet but not yet in the system
    const existingNormSet = new Set(lines.map((l) => normalizeEgyptPhone(l.number)));
    const brandNewLines: MobileLine[] = syncPreview.items
      .filter((it) => !existingNormSet.has(it.number))
      .map((it) => ({
        id: uid(),
        number: it.number,
        employee: it.employeeName,
        nationalId: it.nationalId || undefined,
        plan: 'باقة موظف معتمدة',
        monthlyCost: 0,
        status: 'نشط',
        note: 'مستورد عبر شيت الموظفين'
      }));

    const finalLines = deduplicateLines([...brandNewLines, ...updatedExisting]);
    onSaveLines(finalLines);

    showToast(
      `✓ تم بنجاح إسناد وربط ${syncPreview.matchedCount} خط بالموظفين وتحديث ${syncPreview.nidCount} رقم قومي (وإضافة ${syncPreview.newCount} خط جديد)!`
    );
    setShowEmployeeSyncModal(false);
    setSyncPreview(null);
  };

  // Smart Excel / CSV Reconciliation
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReconLoading(true);
    setReconStatus('جاري قراءة شيت الإكسيل واستخراج أرقام الهواتف والمبالغ والأرقام القومية بدقة...');

    try {
      const xlsxLib = await import('xlsx');
      if (!xlsxLib || !xlsxLib.read) {
        throw new Error('مكتبة Excel غير متوفرة');
      }

      const arrayBuf = await file.arrayBuffer();
      const wb = xlsxLib.read(arrayBuf, { type: 'array' });
      
      // Scan all sheets in the Excel workbook
      const rawRows: any[] = [];
      wb.SheetNames.forEach((sName) => {
        const sheet = wb.Sheets[sName];
        if (sheet) {
          const rows: any[] = xlsxLib.utils.sheet_to_json(sheet, { defval: '' });
          if (Array.isArray(rows)) {
            rawRows.push(...rows);
          }
        }
      });

      const rawItemsMap = new Map<string, { number: string; amount: number; name?: string; nationalId?: string }>();

      for (const row of rawRows) {
        const parsed = parseTelecomRow(row);
        if (parsed.number) {
          const norm = normalizeEgyptPhone(parsed.number);
          if (norm) {
            if (rawItemsMap.has(norm)) {
              const prev = rawItemsMap.get(norm)!;
              prev.amount = (prev.amount || 0) + (parsed.amount || 0);
              if (!prev.name && parsed.employee) prev.name = parsed.employee;
              if (!prev.nationalId && parsed.nationalId) prev.nationalId = parsed.nationalId;
            } else {
              rawItemsMap.set(norm, {
                number: norm,
                amount: parsed.amount || 0,
                name: parsed.employee || undefined,
                nationalId: parsed.nationalId || undefined
              });
            }
          }
        }
      }

      const extractedItems = Array.from(rawItemsMap.values());

      if (!extractedItems.length) {
        setReconStatus('لم نتمكن من استخراج أي أرقام هواتف صالحة من شيت الإكسيل. تأكد من احتواء الشيت على عمود للأرقام.');
        setReconLoading(false);
        return;
      }

      processReconciliation(extractedItems);
    } catch (err: any) {
      setReconStatus(`خطأ أثناء قراءة ملف الإكسيل: ${err.message || String(err)}`);
    } finally {
      setReconLoading(false);
    }
  };

  const processReconciliation = (billItems: { number: string; amount?: number; name?: string; nationalId?: string }[]) => {
    // 1. Strictly deduplicate bill items by normalized phone number
    const uniqueBillMap = new Map<string, { number: string; amount?: number; name?: string; nationalId?: string }>();
    billItems.forEach((it) => {
      const norm = normalizeEgyptPhone(it.number);
      if (!norm) return;
      if (uniqueBillMap.has(norm)) {
        const prev = uniqueBillMap.get(norm)!;
        // Merge multiple entries for same number: sum charges and preserve name/nationalId
        prev.amount = (prev.amount || 0) + (it.amount || 0);
        if (!prev.name && it.name) prev.name = it.name;
        if (!prev.nationalId && it.nationalId) prev.nationalId = it.nationalId;
      } else {
        uniqueBillMap.set(norm, {
          number: norm,
          amount: it.amount,
          name: it.name,
          nationalId: it.nationalId
        });
      }
    });
    const uniqueBillItems = Array.from(uniqueBillMap.values());

    // 2. Build map of existing system lines (strictly deduplicated)
    const uniqueSystemLines = deduplicateLines(lines);
    const systemMap = new Map<string, MobileLine>();
    uniqueSystemLines.forEach((l) => {
      const norm = normalizeEgyptPhone(l.number);
      if (norm && !systemMap.has(norm)) {
        systemMap.set(norm, l);
      }
    });

    const matchedSystemIds = new Set<string>();
    const matched: {
      number: string;
      systemLine: MobileLine;
      billAmount?: number;
      billName?: string;
      billNationalId?: string;
    }[] = [];
    const unknownInBill: { number: string; amount?: number; name?: string; nationalId?: string }[] = [];
    const billNumberSet = new Set<string>();

    uniqueBillItems.forEach((it) => {
      billNumberSet.add(it.number);
      const sysLine = systemMap.get(it.number);
      if (sysLine && !matchedSystemIds.has(sysLine.id)) {
        matchedSystemIds.add(sysLine.id);
        matched.push({
          number: it.number,
          systemLine: sysLine,
          billAmount: it.amount,
          billName: cleanPersonName(it.name) || undefined,
          billNationalId: it.nationalId || undefined
        });
      } else if (!sysLine) {
        unknownInBill.push(it);
      }
    });

    const missingFromBill = uniqueSystemLines.filter((l) => {
      const norm = normalizeEgyptPhone(l.number);
      return l.status !== 'معطل' && !billNumberSet.has(norm);
    });

    const results = {
      billNumbers: uniqueBillItems,
      matched,
      unknownInBill,
      missingFromBill
    };

    setReconResults(results);
    try {
      localStorage.setItem('monglish_last_recon', JSON.stringify(results));
    } catch (e) {}

    setReconStatus('');
    setReconModalTab('MATCHED');
    showToast(`✓ تمت مطابقة ${uniqueBillItems.length} رقم فريد: تم العثور على ${matched.length} مطابق، و${unknownInBill.length} غير مسجل`);
  };

  const handleApplySingleMatchedDetails = (
    number: string,
    billName?: string,
    billNationalId?: string,
    billAmount?: number
  ) => {
    const norm = normalizeEgyptPhone(number);
    const updated = lines.map((l) => {
      if (normalizeEgyptPhone(l.number) === norm) {
        return {
          ...l,
          employee: isCleanPersonName(billName) ? billName!.trim() : l.employee,
          nationalId: billNationalId || l.nationalId,
          monthlyCost: billAmount && billAmount > 0 ? billAmount : l.monthlyCost,
          status: 'نشط' as const
        };
      }
      return l;
    });

    const cleanUpdated = deduplicateLines(updated);
    onSaveLines(cleanUpdated);

    if (reconResults) {
      const updatedMatched = reconResults.matched.map((m) =>
        normalizeEgyptPhone(m.number) === norm
          ? {
              ...m,
              systemLine: {
                ...m.systemLine,
                employee: isCleanPersonName(billName) ? billName!.trim() : m.systemLine.employee,
                nationalId: billNationalId || m.systemLine.nationalId,
                monthlyCost: billAmount && billAmount > 0 ? billAmount : m.systemLine.monthlyCost,
                status: 'نشط' as const
              }
            }
          : m
      );
      const updatedRecon = { ...reconResults, matched: updatedMatched };
      setReconResults(updatedRecon);
      try {
        localStorage.setItem('monglish_last_recon', JSON.stringify(updatedRecon));
      } catch (e) {}
    }

    showToast(`✓ تم إسناد وتحديث بيانات الخط ${number} (${billName || 'الموظف'}) بنجاح!`);
  };

  const handleApplyAllMatchedDetailsToSystem = () => {
    if (!reconResults || !reconResults.matched.length) return;

    // Find lines that have updates in employee name, national ID, or cost
    const updateMap = new Map<
      string,
      { name?: string; nationalId?: string; amount?: number }
    >();

    reconResults.matched.forEach((m) => {
      const norm = normalizeEgyptPhone(m.number);
      const hasNameUpdate = Boolean(m.billName && isCleanPersonName(m.billName) && m.billName !== m.systemLine.employee);
      const hasNidUpdate = Boolean(m.billNationalId && m.billNationalId !== m.systemLine.nationalId);
      const hasCostUpdate = Boolean(m.billAmount && m.billAmount > 0 && m.billAmount !== m.systemLine.monthlyCost);

      if (hasNameUpdate || hasNidUpdate || hasCostUpdate) {
        updateMap.set(norm, {
          name: isCleanPersonName(m.billName) ? m.billName!.trim() : undefined,
          nationalId: m.billNationalId || undefined,
          amount: m.billAmount && m.billAmount > 0 ? m.billAmount : undefined
        });
      }
    });

    if (updateMap.size === 0) {
      showToast('كافة بيانات الموظفين والأرقام القومية مسندة ومطابقة بالفعل بالنظام ✓');
      return;
    }

    const updated = lines.map((l) => {
      const norm = normalizeEgyptPhone(l.number);
      if (updateMap.has(norm)) {
        const u = updateMap.get(norm)!;
        return {
          ...l,
          employee: u.name || l.employee,
          nationalId: u.nationalId || l.nationalId,
          monthlyCost: u.amount !== undefined ? u.amount : l.monthlyCost,
          status: 'نشط' as const
        };
      }
      return l;
    });

    const cleanUpdated = deduplicateLines(updated);
    onSaveLines(cleanUpdated);

    const updatedMatched = reconResults.matched.map((m) => {
      const norm = normalizeEgyptPhone(m.number);
      if (updateMap.has(norm)) {
        const u = updateMap.get(norm)!;
        return {
          ...m,
          systemLine: {
            ...m.systemLine,
            employee: u.name || m.systemLine.employee,
            nationalId: u.nationalId || m.systemLine.nationalId,
            monthlyCost: u.amount !== undefined ? u.amount : m.systemLine.monthlyCost,
            status: 'نشط' as const
          }
        };
      }
      return m;
    });

    const updatedRecon = { ...reconResults, matched: updatedMatched };
    setReconResults(updatedRecon);
    try {
      localStorage.setItem('monglish_last_recon', JSON.stringify(updatedRecon));
    } catch (e) {}

    showToast(`✓ تم إسناد وتحديث بيانات ${updateMap.size} خط للموظفين وتحديث الأرقام القومية من الشيت بنجاح!`);
  };

  const handleUpdateSingleMatchedNationalId = (number: string, billNationalId: string) => {
    const norm = normalizeEgyptPhone(number);
    const updated = lines.map((l) =>
      normalizeEgyptPhone(l.number) === norm ? { ...l, nationalId: billNationalId } : l
    );
    onSaveLines(updated);

    if (reconResults) {
      const updatedMatched = reconResults.matched.map((m) =>
        normalizeEgyptPhone(m.number) === norm
          ? { ...m, systemLine: { ...m.systemLine, nationalId: billNationalId } }
          : m
      );
      const updatedRecon = { ...reconResults, matched: updatedMatched };
      setReconResults(updatedRecon);
      try {
        localStorage.setItem('monglish_last_recon', JSON.stringify(updatedRecon));
      } catch (e) {}
    }
    showToast(`تم تحديث الرقم القومي للخط ${number} بنجاح ✓`);
  };

  const handleUpdateAllMatchedNationalIds = () => {
    if (!reconResults) return;
    const candidates = reconResults.matched.filter(
      (m) => m.billNationalId && (!m.systemLine.nationalId || m.systemLine.nationalId !== m.billNationalId)
    );

    if (!candidates.length) {
      showToast('كافة الأرقام القومية مطابقة ومحدثة بالفعل في النظام ✓');
      return;
    }

    const mapUpdates = new Map<string, string>();
    candidates.forEach((c) => {
      mapUpdates.set(normalizeEgyptPhone(c.number), c.billNationalId!);
    });

    const updated = lines.map((l) => {
      const norm = normalizeEgyptPhone(l.number);
      if (mapUpdates.has(norm)) {
        return { ...l, nationalId: mapUpdates.get(norm) };
      }
      return l;
    });

    onSaveLines(updated);

    const updatedMatched = reconResults.matched.map((m) => {
      const norm = normalizeEgyptPhone(m.number);
      if (mapUpdates.has(norm)) {
        return { ...m, systemLine: { ...m.systemLine, nationalId: mapUpdates.get(norm) } };
      }
      return m;
    });

    const updatedRecon = { ...reconResults, matched: updatedMatched };
    setReconResults(updatedRecon);
    try {
      localStorage.setItem('monglish_last_recon', JSON.stringify(updatedRecon));
    } catch (e) {}

    showToast(`✓ تم تحديث الأرقام القومية لـ ${candidates.length} خط بالنظام من الشيت بنجاح!`);
  };

  const handleAddAllUnknownToSystem = () => {
    if (!reconResults || !reconResults.unknownInBill.length) return;

    // Strict deduplication against existing system lines
    const existingSystemNumbers = new Set(lines.map((l) => normalizeEgyptPhone(l.number)));
    const genuinelyNew = reconResults.unknownInBill.filter(
      (item) => !existingSystemNumbers.has(normalizeEgyptPhone(item.number))
    );

    if (!genuinelyNew.length) {
      showToast('⚠️ كافة الأرقام مسجلة بالفعل في النظام — تم منع التكرار بنجاح ✓');
      const updatedRecon = {
        ...reconResults,
        unknownInBill: []
      };
      setReconResults(updatedRecon);
      try {
        localStorage.setItem('monglish_last_recon', JSON.stringify(updatedRecon));
      } catch (e) {}
      return;
    }

    // Ensure within genuinelyNew itself each number appears only once
    const uniqueBatchMap = new Map<string, typeof genuinelyNew[0]>();
    genuinelyNew.forEach((item) => {
      const norm = normalizeEgyptPhone(item.number);
      if (!uniqueBatchMap.has(norm)) {
        uniqueBatchMap.set(norm, item);
      }
    });

    const newItems: MobileLine[] = Array.from(uniqueBatchMap.values()).map((item) => {
      const cleanEmp = cleanPersonName(item.name) || undefined;
      return {
        id: uid(),
        number: item.number,
        employee: cleanEmp,
        nationalId: item.nationalId || undefined,
        plan: 'باقة فودافون المعتمدة',
        monthlyCost: item.amount || 0,
        status: 'نشط',
        note: 'مستورد آلياً عبر مطابقة الفاتورة'
      };
    });

    const updatedLines = deduplicateLines([...newItems, ...lines]);
    onSaveLines(updatedLines);
    showToast(`تمت إضافة ${newItems.length} خط جديد لقاعدة البيانات بنجاح كخطوط نشطة ومسندة ✓`);

    const updatedRecon = {
      ...reconResults,
      unknownInBill: [],
      matched: [
        ...reconResults.matched,
        ...newItems.map((nl) => ({
          number: nl.number,
          systemLine: nl,
          billAmount: nl.monthlyCost,
          billName: nl.employee,
          billNationalId: nl.nationalId
        }))
      ]
    };
    setReconResults(updatedRecon);
    try {
      localStorage.setItem('monglish_last_recon', JSON.stringify(updatedRecon));
    } catch (e) {}
  };

  const handleAddSingleUnknown = (item: { number: string; amount?: number; name?: string; nationalId?: string }) => {
    const norm = normalizeEgyptPhone(item.number);
    if (lines.some((l) => normalizeEgyptPhone(l.number) === norm)) {
      showToast(`الرقم ${norm} مسجل بالفعل في النظام — تم منع التكرار ✓`);
      if (reconResults) {
        const updatedRecon = {
          ...reconResults,
          unknownInBill: reconResults.unknownInBill.filter((x) => normalizeEgyptPhone(x.number) !== norm)
        };
        setReconResults(updatedRecon);
      }
      return;
    }

    const cleanEmp = cleanPersonName(item.name) || undefined;
    const newLine: MobileLine = {
      id: uid(),
      number: norm,
      employee: cleanEmp,
      nationalId: item.nationalId || undefined,
      plan: 'باقة فودافون',
      monthlyCost: item.amount || 0,
      status: 'نشط',
      note: 'مضاف من تقرير المطابقة'
    };

    onSaveLines(deduplicateLines([newLine, ...lines]));
    showToast(`تمت إضافة الخط ${norm} (${cleanEmp || 'نشط'}) للنظام بنجاح ✓`);

    if (reconResults) {
      const updatedRecon = {
        ...reconResults,
        unknownInBill: reconResults.unknownInBill.filter((x) => normalizeEgyptPhone(x.number) !== norm),
        matched: [
          ...reconResults.matched,
          {
            number: norm,
            systemLine: newLine,
            billAmount: item.amount,
            billNationalId: item.nationalId
          }
        ]
      };
      setReconResults(updatedRecon);
      try {
        localStorage.setItem('monglish_last_recon', JSON.stringify(updatedRecon));
      } catch (e) {}
    }
  };

  const handleClearRecon = () => {
    setReconResults(null);
    setReconFilter('ALL');
    try {
      localStorage.removeItem('monglish_last_recon');
    } catch (e) {}
    showToast('تم مسح نتائج المطابقة');
  };

  const handleExportReconExcel = async () => {
    if (!reconResults) return;
    const xlsxLib = await import('xlsx');
    if (!xlsxLib || !xlsxLib.utils) {
      showToast('مكتبة Excel غير متوفرة');
      return;
    }

    const wb = xlsxLib.utils.book_new();

    // Sheet 1: Matched
    const matchedData = reconResults.matched.map((m) => {
      const sysCost = m.systemLine.monthlyCost || 0;
      const billCost = m.billAmount !== undefined ? m.billAmount : sysCost;
      const diff = billCost - sysCost;
      return {
        'رقم الموبايل': m.number,
        'اسم الموظف بالنظام': m.systemLine.employee || 'بالمخزن',
        'اسم الموظف بالشيت': m.billName || '—',
        'الرقم القومي بالنظام': m.systemLine.nationalId || '—',
        'الرقم القومي بالشيت': m.billNationalId || '—',
        'الباقة المسجلة': m.systemLine.plan || '—',
        'التكلفة بالنظام (ج.م)': sysCost,
        'قيمة الفاتورة (ج.م)': billCost,
        'الفرق المالي (ج.م)': diff,
        'حالة التطابق': diff === 0 ? 'مطابق تماماً' : diff > 0 ? 'الفاتورة أعلى' : 'النظام أعلى'
      };
    });
    const wsMatched = xlsxLib.utils.json_to_sheet(matchedData);
    xlsxLib.utils.book_append_sheet(wb, wsMatched, 'الأرقام المتطابقة');

    // Sheet 2: Unknown in Bill
    const unknownData = reconResults.unknownInBill.map((u) => ({
      'رقم الموبايل': u.number,
      'الاسم المستخرج من الفاتورة': u.name || '—',
      'الرقم القومي': u.nationalId || '—',
      'القيمة الواردة بالفاتورة (ج.م)': u.amount || 0,
      'الحالة': 'موجود بالفاتورة وغير مسجل بالنظام'
    }));
    const wsUnknown = xlsxLib.utils.json_to_sheet(unknownData);
    xlsxLib.utils.book_append_sheet(wb, wsUnknown, 'أرقام بالفاتورة غير مسجلة');

    // Sheet 3: Missing from Bill
    const missingData = reconResults.missingFromBill.map((l) => ({
      'رقم الموبايل': l.number,
      'الموظف المسند إليه': l.employee || 'بالمخزن',
      'الرقم القومي': l.nationalId || '—',
      'حالة الخط': l.status,
      'التكلفة الشهرية (ج.م)': l.monthlyCost || 0,
      'الحالة': 'مسجل بالنظام ولم يرد بالفاتورة'
    }));
    const wsMissing = xlsxLib.utils.json_to_sheet(missingData);
    xlsxLib.utils.book_append_sheet(wb, wsMissing, 'أرقام بالنظام لم ترد بالفاتورة');

    xlsxLib.writeFile(wb, `تقرير_مطابقة_خطوط_فودافون_${today().replace(/\//g, '-')}.xlsx`);
    showToast('تم تصدير تقرير المطابقة الشامل إلى ملف Excel بنجاح ✓');
  };

  return (
    <div className="space-y-6">
      {/* Head */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#075073] tracking-tight">📞 خطوط الموبايل وشبكة الاتصالات</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {lines.length} خط مسجل — إجمالي الفاتورة الشهرية المتوقعة:{' '}
            <strong className="font-mono text-[#075073] font-bold">{totalMonthlyCost.toLocaleString('ar-EG')} ج.م</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => onExportCSV('lines')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-stone-600" />
                <span>تصدير Excel</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSyncStatus('');
                  setSyncPreview(null);
                  setShowEmployeeSyncModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-xs transition-all cursor-pointer"
                title="مطابقة الخطوط برقم الهاتف وإسناد الموظف والرقم القومي من ملف الإكسيل"
              >
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>👥 ربط وتحديث شيت الموظفين</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setReconStatus('');
                  setShowReconcileModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-all cursor-pointer"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>🔍 مطابقة الفاتورة الذكية (PDF / Excel)</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenExcelImport('lines')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 shadow-xs transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>استيراد أرقام من Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#E68131]" />
                <span>+ إضافة خط جديد</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => setLineStatusFilter('ALL')}
          className={`p-4 rounded-xl border text-right transition-all cursor-pointer shadow-xs ${
            lineStatusFilter === 'ALL'
              ? 'bg-[#075073] text-white border-[#075073] ring-2 ring-[#075073]/30'
              : 'bg-white text-stone-800 border-stone-200 border-r-4 border-r-[#075073] hover:bg-stone-50'
          }`}
        >
          <div className="text-xs font-bold opacity-80 mb-1">إجمالي الخطوط المسجلة</div>
          <div className={`text-2xl font-black font-mono ${lineStatusFilter === 'ALL' ? 'text-white' : 'text-[#075073]'}`}>
            {lines.length}
          </div>
          <div className={`text-[11px] mt-1 ${lineStatusFilter === 'ALL' ? 'text-white/70' : 'text-stone-400'}`}>
            كافة الشرائح في النظام (عرض الكل)
          </div>
        </button>

        <button
          type="button"
          onClick={() => setLineStatusFilter('ACTIVE')}
          className={`p-4 rounded-xl border text-right transition-all cursor-pointer shadow-xs ${
            lineStatusFilter === 'ACTIVE'
              ? 'bg-emerald-700 text-white border-emerald-700 ring-2 ring-emerald-600/30'
              : 'bg-white text-stone-800 border-stone-200 border-r-4 border-r-emerald-600 hover:bg-emerald-50/40'
          }`}
        >
          <div className="text-xs font-bold opacity-80 mb-1">نشط ومسند لموظف</div>
          <div className={`text-2xl font-black font-mono ${lineStatusFilter === 'ACTIVE' ? 'text-white' : 'text-emerald-700'}`}>
            {activeLines.length}
          </div>
          <div className={`text-[11px] mt-1 ${lineStatusFilter === 'ACTIVE' ? 'text-white/70' : 'text-stone-400'}`}>
            نسبة الاستغلال: {lines.length > 0 ? Math.round((activeLines.length / lines.length) * 100) : 0}%
          </div>
        </button>

        <button
          type="button"
          onClick={() => setLineStatusFilter('STOCK')}
          className={`p-4 rounded-xl border text-right transition-all cursor-pointer shadow-xs ${
            lineStatusFilter === 'STOCK'
              ? 'bg-amber-600 text-white border-amber-600 ring-2 ring-amber-500/30'
              : 'bg-white text-stone-800 border-stone-200 border-r-4 border-r-amber-500 hover:bg-amber-50/40'
          }`}
        >
          <div className="text-xs font-bold opacity-80 mb-1">متاح بالمخزن (احتياطي)</div>
          <div className={`text-2xl font-black font-mono ${lineStatusFilter === 'STOCK' ? 'text-white' : 'text-amber-600'}`}>
            {stockLines.length}
          </div>
          <div className={`text-[11px] mt-1 ${lineStatusFilter === 'STOCK' ? 'text-white/70' : 'text-stone-400'}`}>
            جاهز للتسليم لأي موظف جديد
          </div>
        </button>

        <button
          type="button"
          onClick={() => setLineStatusFilter('DISABLED')}
          className={`p-4 rounded-xl border text-right transition-all cursor-pointer shadow-xs ${
            lineStatusFilter === 'DISABLED'
              ? 'bg-rose-700 text-white border-rose-700 ring-2 ring-rose-600/30'
              : 'bg-white text-stone-800 border-stone-200 border-r-4 border-r-rose-600 hover:bg-rose-50/40'
          }`}
        >
          <div className="text-xs font-bold opacity-80 mb-1">معطل أو ملغي</div>
          <div className={`text-2xl font-black font-mono ${lineStatusFilter === 'DISABLED' ? 'text-white' : 'text-rose-600'}`}>
            {disabledLines.length}
          </div>
          <div className={`text-[11px] mt-1 ${lineStatusFilter === 'DISABLED' ? 'text-white/70' : 'text-stone-400'}`}>
            موقوف مؤقتاً أو مفصول
          </div>
        </button>
      </div>

      {/* Duplicate Phone Numbers Alert Banner */}
      {duplicateCount > 0 && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 shadow-sm flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-amber-200 text-amber-900">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <h4 className="font-bold text-sm text-amber-950">
                تنبيه: تم رصد {duplicateCount} تكرار في أرقام الهواتف المسجلة بالنظام!
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                تكرار الأرقام يؤدي لعدم دقة المطابقة وازدواجية السجلات. يمكنك دمج وتوحيد بيانات هذه الخطوط بضغطة واحدة.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleMergeAllDuplicates}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>⚡ دمج وتنظيف {duplicateCount} رقم مكرر فوراً</span>
          </button>
        </div>
      )}

      {/* Persistent Reconciliation Dashboard Banner */}
      {reconResults && (
        <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-md p-4.5 space-y-3.5 transition-all">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-stone-100">
            <div className="flex items-center gap-2 text-stone-800">
              <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                <FileCheck2 className="w-5 h-5" />
              </span>
              <div>
                <h4 className="font-black text-sm text-[#075073]">
                  لوحة نتائج مطابقة الفاتورة والشيت (فحص حي مستمر)
                </h4>
                <p className="text-[11px] text-stone-500">
                  تم تحليل {reconResults.billNumbers.length} رقم من الفاتورة — يمكنك تصفية جدول الخطوط حسب نتيجة المطابقة أدناه:
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReconModalTab('MATCHED');
                  setShowReconcileModal(true);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5 text-[#E68131]" />
                <span>عرض التفاصيل الكاملة للمطابقة</span>
              </button>
              <button
                type="button"
                onClick={handleExportReconExcel}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير Excel</span>
              </button>
              <button
                type="button"
                onClick={handleClearRecon}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                title="إلغاء نتائج الفحص"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Filter Chips for Table */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setReconFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                reconFilter === 'ALL'
                  ? 'bg-[#075073] text-white border-[#075073] shadow-xs'
                  : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
              }`}
            >
              عرض جميع الخطوط ({lines.length})
            </button>
            <button
              type="button"
              onClick={() => setReconFilter('MATCHED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                reconFilter === 'MATCHED'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>✅ أرقام مطابقة مؤكدة ({reconResults.matched.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setReconFilter('MISSING')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                reconFilter === 'MISSING'
                  ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>⚠️ بالنظام ولم ترد بالفاتورة ({reconResults.missingFromBill.length})</span>
            </button>
            {diffCostCount > 0 && (
              <button
                type="button"
                onClick={() => setReconFilter('DIFF_COST')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                  reconFilter === 'DIFF_COST'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                }`}
              >
                <span>⚡ فروقات التكلفة ({diffCostCount})</span>
              </button>
            )}

            {reconResults.unknownInBill.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setReconModalTab('UNKNOWN');
                  setShowReconcileModal(true);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>🚨 {reconResults.unknownInBill.length} رقم بالفاتورة غير مسجل</span>
                <span className="underline font-normal text-[11px]">إضافة للنظام</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search Bar & Bulk Actions */}
      <div className="space-y-3">
        {/* Line Status Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-xl border border-stone-200">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-stone-500 ml-1">تصفية الخطوط:</span>
            <button
              type="button"
              onClick={() => setLineStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                lineStatusFilter === 'ALL'
                  ? 'bg-[#075073] text-white shadow-xs'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
              }`}
            >
              الكل ({lines.length})
            </button>
            <button
              type="button"
              onClick={() => setLineStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                lineStatusFilter === 'ACTIVE'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
              }`}
            >
              نشط ومسند ({activeLines.length})
            </button>
            <button
              type="button"
              onClick={() => setLineStatusFilter('STOCK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                lineStatusFilter === 'STOCK'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800'
              }`}
            >
              بالمخزن احتياطي ({stockLines.length})
            </button>
            <button
              type="button"
              onClick={() => setLineStatusFilter('DISABLED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                lineStatusFilter === 'DISABLED'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
              }`}
            >
              معطل ({disabledLines.length})
            </button>
          </div>

          <div className="text-xs text-stone-500 font-bold px-1">
            المعروض: <span className="font-mono text-[#075073] font-black">{filteredLines.length}</span> من {lines.length}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث بالرقم (مثلاً 010... أو 10...) أو اسم الموظف أو نوع الباقة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-10 py-2.5 bg-white rounded-xl border border-stone-200 text-xs font-medium focus:border-[#075073] focus:outline-none transition-colors shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Select by Count */}
          <div className="flex items-center gap-1.5 flex-wrap bg-white p-1.5 rounded-xl border border-stone-200 text-xs">
            <span className="text-[11px] font-bold text-stone-500 px-1">تحديد كمية:</span>
            <button
              type="button"
              onClick={() => handleSelectCount(5)}
              className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] transition-colors"
            >
              5
            </button>
            <button
              type="button"
              onClick={() => handleSelectCount(10)}
              className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] transition-colors"
            >
              10
            </button>
            <button
              type="button"
              onClick={() => handleSelectCount(25)}
              className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] transition-colors"
            >
              25
            </button>
            <button
              type="button"
              onClick={() => handleSelectCount(50)}
              className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] transition-colors"
            >
              50
            </button>
            <div className="flex items-center gap-1">
              <input
                type="number"
                placeholder="عدد"
                min="1"
                max={filteredLines.length}
                value={customSelectCount}
                onChange={(e) => setCustomSelectCount(e.target.value)}
                className="w-14 px-1.5 py-1 text-[11px] text-center font-mono border border-stone-200 rounded-lg focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const val = parseInt(customSelectCount, 10);
                  if (val > 0) handleSelectCount(val);
                }}
                className="px-2 py-1 rounded-lg bg-[#075073] text-white font-bold text-[11px] hover:bg-[#03151F]"
              >
                تحديد
              </button>
            </div>
            <button
              type="button"
              onClick={handlePrintLines}
              className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] transition-colors flex items-center gap-1"
              title="طباعة كشف الخطوط"
            >
              <span>🖨️ طباعة</span>
            </button>
          </div>
        </div>

        {/* Bulk Action Toolbar */}
        {selectedLineIds.length > 0 && (
          <div className="bg-gradient-to-r from-[#075073] to-[#03151F] text-white px-4 py-3 rounded-xl shadow-lg border border-white/10 flex items-center justify-between flex-wrap gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-black">
                تم تحديد <span className="font-mono text-amber-300 font-black text-sm">{selectedLineIds.length}</span> خط
                من أصل {filteredLines.length}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => handleBulkSetStatus('معطل')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
                  >
                    تعيين كمعطل
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkSetStatus('نشط')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                  >
                    تعيين كنشط
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف الخطوط المحددة ({selectedLineIds.length})</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedLineIds([])}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lines Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#f4efe2] text-[#075073] border-b border-stone-200 font-bold">
              <tr>
                <th className="py-3 px-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded text-[#075073] border-stone-300 focus:ring-[#075073] cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3.5">رقم الموبايل</th>
                <th className="py-3 px-3.5">الموظف المسند إليه</th>
                <th className="py-3 px-3.5">الرقم القومي</th>
                <th className="py-3 px-3.5">حالة الخط</th>
                {reconResults && <th className="py-3 px-3.5 text-center">المطابقة مع الفاتورة</th>}
                <th className="py-3 px-3.5">الباقة</th>
                <th className="py-3 px-3.5">التكلفة الشهرية</th>
                <th className="py-3 px-3.5">ملاحظات</th>
                {canEdit && <th className="py-3 px-3.5 text-center">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {paginatedLines.map((l) => {
                const isDis = l.status === 'معطل';
                const assigned = isLineAssigned(l);
                const isSelected = selectedLineIds.includes(l.id);
                const norm = normalizeEgyptPhone(l.number);
                const matchedInfo = matchedMap.get(norm);
                const isMissingFromBill = missingSet.has(norm);
                const costDiff = matchedInfo && matchedInfo.billAmount !== undefined
                  ? matchedInfo.billAmount - (l.monthlyCost || 0)
                  : 0;
                const nidMeta = l.nationalId ? getNationalIdMetadata(l.nationalId) : null;

                return (
                  <tr
                    key={l.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-amber-50/70' : 'hover:bg-[#fbf8f1]'
                    }`}
                  >
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(l.id)}
                        className="w-4 h-4 rounded text-[#075073] border-stone-300 focus:ring-[#075073] cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3.5 font-mono font-bold text-sm text-stone-900">{l.number}</td>
                    <td className="py-3 px-3.5 font-semibold text-stone-800">
                      {assigned ? l.employee : <span className="text-stone-400 font-normal">— بالمخزن</span>}
                    </td>
                    <td className="py-3 px-3.5">
                      {l.nationalId ? (
                        <div
                          className="inline-flex items-center gap-1.5 bg-stone-100/90 border border-stone-200 px-2 py-1 rounded-lg group"
                          title={
                            nidMeta
                              ? `الرقم القومي المصري: ${l.nationalId}\nتاريخ الميلاد: ${nidMeta.birthDate}\nالمحافظة: ${nidMeta.governorate}\nالنوع: ${nidMeta.gender}`
                              : `الرقم القومي المصري: ${l.nationalId}`
                          }
                        >
                          <CreditCard className="w-3.5 h-3.5 text-[#075073] shrink-0" />
                          <span className="font-mono font-bold text-xs text-[#075073] tracking-wide">
                            {l.nationalId}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(l.nationalId!);
                              showToast('تم نسخ الرقم القومي بنجاح ✓');
                            }}
                            className="text-stone-400 hover:text-stone-700 p-0.5 rounded cursor-pointer transition-colors"
                            title="نسخ الرقم القومي"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-stone-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          isDis
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : assigned
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {isDis ? 'معطل ❌' : assigned ? 'نشط مع موظف ✅' : 'في المخزون 📦'}
                      </span>
                    </td>

                    {/* Reconciliation Status Column */}
                    {reconResults && (
                      <td className="py-3 px-3 text-center">
                        {matchedInfo ? (
                          costDiff === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>مطابق ({matchedInfo.billAmount || l.monthlyCost} ج.م)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>مطابق (فرق {costDiff > 0 ? `+${costDiff}` : costDiff} ج.م)</span>
                            </span>
                          )
                        ) : isMissingFromBill ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <span>لم يرد بالفاتورة</span>
                          </span>
                        ) : (
                          <span className="text-stone-400 text-xs">—</span>
                        )}
                      </td>
                    )}

                    <td className="py-3 px-3.5 text-stone-600">{l.plan || '—'}</td>
                    <td className="py-3 px-3.5 font-mono font-bold text-stone-900">
                      {(l.monthlyCost || 0).toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="py-3 px-3.5 text-stone-500 max-w-xs truncate">{l.note || '—'}</td>
                    {canEdit && (
                      <td className="py-3 px-3.5 text-center">
                        <button
                          onClick={() => handleOpenEdit(l)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                        >
                          ✏️ تعديل
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filteredLines.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? (reconResults ? 10 : 9) : (reconResults ? 9 : 8)} className="py-8 text-center text-stone-400">
                    لا توجد خطوط مطابقة لمعايير البحث والتصفية
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredLines.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 bg-stone-50/80 border-t border-stone-200 text-xs">
            <div className="flex items-center gap-2 text-stone-600 font-medium">
              <span>عرض</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                  setPageSize(val as any);
                  setCurrentPage(1);
                }}
                className="bg-white border border-stone-300 rounded-lg px-2 py-1 text-xs font-bold text-[#075073] focus:outline-none cursor-pointer"
              >
                <option value={25}>25 خط / صفحة</option>
                <option value={50}>50 خط / صفحة</option>
                <option value={100}>100 خط / صفحة</option>
                <option value={250}>250 خط / صفحة</option>
                <option value="all">عرض الكل ({filteredLines.length})</option>
              </select>
              <span>
                | من <strong className="text-stone-900 font-mono font-bold">{pageSize === 'all' ? 1 : (currentSafePage - 1) * (pageSize as number) + 1}</strong> إلى{' '}
                <strong className="text-stone-900 font-mono font-bold">
                  {pageSize === 'all' ? filteredLines.length : Math.min(currentSafePage * (pageSize as number), filteredLines.length)}
                </strong>{' '}
                (إجمالي: <strong className="text-[#075073] font-mono font-black">{filteredLines.length}</strong> خط)
              </span>
            </div>

            {pageSize !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentSafePage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                  title="الصفحة الأولى"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={currentSafePage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                >
                  السابق
                </button>

                <div className="flex items-center gap-1 mx-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = currentSafePage;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (currentSafePage <= 3) pageNum = i + 1;
                    else if (currentSafePage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentSafePage - 2 + i;

                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-colors ${
                          currentSafePage === pageNum
                            ? 'bg-[#075073] text-white shadow-xs'
                            : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={currentSafePage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                >
                  التالي
                </button>
                <button
                  type="button"
                  disabled={currentSafePage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                  title="الصفحة الأخيرة"
                >
                  »
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Smart Reconciliation Modal */}
      {showReconcileModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="w-full max-w-4xl bg-white rounded-3xl p-6 shadow-2xl border-t-4 border-amber-500 space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-xl text-amber-700">
                  🔍
                </div>
                <div>
                  <h3 className="text-base font-black text-[#075073]">
                    لوحة مطابقة فواتير الاتصالات والأرقام (PDF و Excel)
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    فحص دقيق لكافة الصفحات والشيتات واستخراج الأرقام القومية بدقة وتقسيم الأرقام إلى مطابق، غير مسجل، أو مفقود من الفاتورة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReconcileModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Reconciliation File Selector Tabs */}
            <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setReconcileMode('pdf')}
                className={`flex-1 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  reconcileMode === 'pdf' ? 'bg-white text-[#075073] shadow-xs' : 'text-stone-600'
                }`}
              >
                <FileText className="w-4 h-4 text-rose-600" />
                <span>فاتورة فودافون الرسمية (PDF - فحص كافة الصفحات)</span>
              </button>
              <button
                type="button"
                onClick={() => setReconcileMode('excel')}
                className={`flex-1 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  reconcileMode === 'excel' ? 'bg-white text-[#075073] shadow-xs' : 'text-stone-600'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>شيت الموظفين / الفاتورة (Excel / CSV مع الرقم القومي)</span>
              </button>
            </div>

            {/* Upload Area */}
            <div className="space-y-3 shrink-0 p-4 bg-stone-50 rounded-2xl border border-dashed border-stone-300">
              <label className="block text-xs font-bold text-stone-700">
                {reconcileMode === 'pdf' ? 'اختر ملف الفاتورة PDF:' : 'اختر ملف الإكسيل (.xlsx, .xls, .csv):'}
              </label>
              {reconcileMode === 'pdf' ? (
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  disabled={reconLoading}
                  className="w-full text-xs file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[#075073] file:text-white file:font-bold file:cursor-pointer p-1 bg-white rounded-xl border border-stone-200 cursor-pointer"
                />
              ) : (
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleExcelUpload}
                  disabled={reconLoading}
                  className="w-full text-xs file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[#075073] file:text-white file:font-bold file:cursor-pointer p-1 bg-white rounded-xl border border-stone-200 cursor-pointer"
                />
              )}

              {reconLoading && (
                <div className="flex items-center gap-2 text-xs text-amber-800 font-bold animate-pulse">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                  <span>{reconStatus}</span>
                </div>
              )}
              {reconStatus && !reconLoading && <p className="text-xs text-rose-600 font-bold">{reconStatus}</p>}
            </div>

            {/* Results Section with Tabs */}
            {reconResults && (
              <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                {/* Summary bar */}
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setReconModalTab('MATCHED')}
                    className={`p-3 rounded-2xl text-right transition-all cursor-pointer border ${
                      reconModalTab === 'MATCHED'
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-md ring-2 ring-emerald-400'
                        : 'bg-emerald-50/80 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                    }`}
                  >
                    <span className="text-[11px] font-bold block opacity-90">✅ أرقام مطابقة مؤكدة</span>
                    <span className="text-2xl font-black font-mono block mt-0.5">
                      {reconResults.matched.length}
                    </span>
                    <span className="text-[10px] opacity-80 mt-0.5 block">موجودة بالنظام والفاتورة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReconModalTab('UNKNOWN')}
                    className={`p-3 rounded-2xl text-right transition-all cursor-pointer border ${
                      reconModalTab === 'UNKNOWN'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-md ring-2 ring-rose-400'
                        : 'bg-rose-50/80 border-rose-200 text-rose-900 hover:bg-rose-100'
                    }`}
                  >
                    <span className="text-[11px] font-bold block opacity-90">🚨 بالفاتورة وغير مسجلة</span>
                    <span className="text-2xl font-black font-mono block mt-0.5">
                      {reconResults.unknownInBill.length}
                    </span>
                    <span className="text-[10px] opacity-80 mt-0.5 block">تنتظر إضافتها للنظام</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReconModalTab('MISSING')}
                    className={`p-3 rounded-2xl text-right transition-all cursor-pointer border ${
                      reconModalTab === 'MISSING'
                        ? 'bg-amber-600 text-white border-amber-700 shadow-md ring-2 ring-amber-400'
                        : 'bg-amber-50/80 border-amber-200 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    <span className="text-[11px] font-bold block opacity-90">⚠️ بالنظام ولم تأتِ</span>
                    <span className="text-2xl font-black font-mono block mt-0.5">
                      {reconResults.missingFromBill.length}
                    </span>
                    <span className="text-[10px] opacity-80 mt-0.5 block">خطوط غير مفوترة</span>
                  </button>
                </div>

                {/* Tab 1: Detailed List of MATCHED Numbers */}
                {reconModalTab === 'MATCHED' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-xs font-black text-stone-800">
                          قائمة الأرقام المتطابقة بالتفصيل ({reconResults.matched.length} خط مسجل ومطابق):
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {reconResults.matched.some(
                          (m) =>
                            (m.billName && isCleanPersonName(m.billName) && m.billName !== m.systemLine.employee) ||
                            (m.billNationalId && m.billNationalId !== m.systemLine.nationalId) ||
                            (m.billAmount && m.billAmount > 0 && m.billAmount !== m.systemLine.monthlyCost)
                        ) && (
                          <button
                            type="button"
                            onClick={handleApplyAllMatchedDetailsToSystem}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                            <span>⚡ اعتماد إسناد الموظفين وتحديث الأرقام القومية للكل</span>
                          </button>
                        )}
                        <div className="relative w-64">
                          <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="ابحث بالرقم أو الاسم أو الرقم القومي..."
                            value={reconSearch}
                            onChange={(e) => setReconSearch(e.target.value)}
                            className="w-full pl-2 pr-8 py-1.5 bg-stone-50 rounded-lg border border-stone-200 text-xs font-medium focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto border border-stone-200 rounded-2xl bg-white shadow-xs">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[#f8f5ee] text-[#075073] sticky top-0 font-bold border-b border-stone-200">
                          <tr>
                            <th className="py-2.5 px-3">رقم الموبايل</th>
                            <th className="py-2.5 px-3">الموظف المسند إليه</th>
                            <th className="py-2.5 px-3">الرقم القومي</th>
                            <th className="py-2.5 px-3">الباقة المسجلة</th>
                            <th className="py-2.5 px-3">تكلفة النظام</th>
                            <th className="py-2.5 px-3">قيمة الفاتورة</th>
                            <th className="py-2.5 px-3">الفرق المالي</th>
                            <th className="py-2.5 px-3 text-center">حالة التطابق والإسناد</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {reconResults.matched
                            .filter((m) => {
                              if (!reconSearch) return true;
                              const q = reconSearch.toLowerCase();
                              return (
                                m.number.includes(q) ||
                                (isCleanPersonName(m.systemLine.employee) && m.systemLine.employee!.toLowerCase().includes(q)) ||
                                (m.billName && m.billName.toLowerCase().includes(q)) ||
                                (m.systemLine.nationalId && m.systemLine.nationalId.includes(q)) ||
                                (m.billNationalId && m.billNationalId.includes(q)) ||
                                (m.systemLine.plan && m.systemLine.plan.toLowerCase().includes(q))
                              );
                            })
                            .map((m) => {
                              const sysCost = m.systemLine.monthlyCost || 0;
                              const billCost = m.billAmount !== undefined ? m.billAmount : sysCost;
                              const diff = billCost - sysCost;
                              const activeNid = m.systemLine.nationalId || m.billNationalId;
                              const hasSheetNidUpdate = m.billNationalId && (!m.systemLine.nationalId || m.systemLine.nationalId !== m.billNationalId);
                              const hasSheetNameUpdate = m.billName && isCleanPersonName(m.billName) && m.billName !== m.systemLine.employee;

                              return (
                                <tr key={m.number} className="hover:bg-stone-50/70 transition-colors">
                                  <td className="py-2 px-3 font-mono font-bold text-stone-900">{m.number}</td>
                                  <td className="py-2 px-3">
                                    <div className="space-y-1">
                                      <div className="font-semibold text-stone-800">
                                        {isCleanPersonName(m.systemLine.employee) ? (
                                          m.systemLine.employee
                                        ) : (
                                          <span className="text-stone-400 font-normal">— بالمخزن</span>
                                        )}
                                      </div>
                                      {hasSheetNameUpdate && (
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                            الشيت: {m.billName}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleApplySingleMatchedDetails(m.number, m.billName, m.billNationalId, m.billAmount)}
                                            className="text-[10px] font-bold bg-[#075073] hover:bg-[#03151F] text-white px-1.5 py-0.5 rounded cursor-pointer"
                                            title="إسناد هذا الموظف للخط"
                                          >
                                            إسناد
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3">
                                    {hasSheetNidUpdate ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]" title="تم العثور على الرقم القومي في الشيت">
                                          {m.billNationalId}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateSingleMatchedNationalId(m.number, m.billNationalId!)}
                                          className="text-[10px] font-bold bg-[#075073] hover:bg-[#03151F] text-white px-1.5 py-0.5 rounded cursor-pointer"
                                          title="حفظ الرقم القومي لهذا الخط في النظام"
                                        >
                                          حفظ
                                        </button>
                                      </div>
                                    ) : activeNid ? (
                                      <span className="font-mono font-bold text-[#075073] bg-stone-100 px-2 py-0.5 rounded border border-stone-200 text-[11px]">
                                        {activeNid}
                                      </span>
                                    ) : (
                                      <span className="text-stone-400 text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-stone-600">{m.systemLine.plan || '—'}</td>
                                  <td className="py-2 px-3 font-mono text-stone-800">{sysCost} ج.م</td>
                                  <td className="py-2 px-3 font-mono font-bold text-[#075073]">{billCost} ج.م</td>
                                  <td className="py-2 px-3 font-mono font-bold">
                                    {diff === 0 ? (
                                      <span className="text-emerald-600">0 ج.م</span>
                                    ) : diff > 0 ? (
                                      <span className="text-rose-600">+{diff} ج.م</span>
                                    ) : (
                                      <span className="text-amber-600">{diff} ج.م</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <div className="inline-flex flex-col items-center gap-1">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        ✓ مطابق مؤكد
                                      </span>
                                      {(hasSheetNameUpdate || hasSheetNidUpdate) && (
                                        <button
                                          type="button"
                                          onClick={() => handleApplySingleMatchedDetails(m.number, m.billName, m.billNationalId, m.billAmount)}
                                          className="text-[9px] font-bold text-[#075073] hover:underline cursor-pointer"
                                        >
                                          تحديث السجل
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 2: UNKNOWN in Bill */}
                {reconModalTab === 'UNKNOWN' && (
                  <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-xs font-black text-rose-800">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>⚠️ أرقام تُحاسَب عليها في الفاتورة لكنها غير مسجلة في قاعدة بياناتك ({reconResults.unknownInBill.length} خط):</span>
                      </div>
                      {reconResults.unknownInBill.length > 0 && (
                        <button
                          type="button"
                          onClick={handleAddAllUnknownToSystem}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all cursor-pointer"
                        >
                          ➕ إضافة كل هذه الأرقام ({reconResults.unknownInBill.length}) للنظام دفعة واحدة
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {reconResults.unknownInBill.map((item) => (
                        <div
                          key={item.number}
                          className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-rose-200 text-xs gap-2 shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-mono font-bold text-rose-900 text-sm">{item.number}</span>
                            {item.amount !== undefined && (
                              <span className="font-mono font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md text-[11px]">
                                الفاتورة: {item.amount.toLocaleString('ar-EG')} ج.م
                              </span>
                            )}
                            {item.nationalId && (
                              <span className="font-mono font-bold text-[#075073] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md text-[11px]">
                                🪪 {item.nationalId}
                              </span>
                            )}
                            {isCleanPersonName(item.name) ? (
                              <span className="text-stone-600 font-semibold">({item.name})</span>
                            ) : (
                              <span className="text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded-md font-bold text-[10px]">
                                غير مسجل بالنظام (بالمخزن)
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddSingleUnknown(item)}
                            className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 transition-colors cursor-pointer"
                          >
                            + إضافة للنظام
                          </button>
                        </div>
                      ))}
                      {reconResults.unknownInBill.length === 0 && (
                        <p className="text-center py-4 text-xs text-stone-500 font-bold">
                          🎉 تم تسجيل كافة أرقام الفاتورة في النظام بنجاح!
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 3: MISSING from Bill */}
                {reconModalTab === 'MISSING' && (
                  <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                    <div className="text-xs font-black text-amber-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>❓ أرقام مسجلة كخطوط نشطة بالنظام ولكنها لم تظهر في هذه الفاتورة ({reconResults.missingFromBill.length} خط):</span>
                    </div>
                    <p className="text-[11px] text-stone-600">
                      قد تكون هذه الخطوط معطلة لدى شركة الاتصالات، أو مسجلة تحت حساب أو فاتورة فرعية أخرى.
                    </p>

                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {reconResults.missingFromBill.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-amber-200 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-stone-800 text-sm">{l.number}</span>
                            <span className="text-stone-600 font-semibold">
                              {isCleanPersonName(l.employee) ? l.employee : 'بالمخزن'}
                            </span>
                            {l.nationalId && (
                              <span className="font-mono text-stone-500 text-[11px]">
                                (الرقم القومي: {l.nationalId})
                              </span>
                            )}
                            <span className="text-stone-400 font-mono">({l.plan || 'بدون باقة'})</span>
                          </div>
                          <span className="font-mono font-bold text-stone-700">{l.monthlyCost} ج.م</span>
                        </div>
                      ))}
                      {reconResults.missingFromBill.length === 0 && (
                        <p className="text-center py-4 text-xs text-stone-500 font-bold">
                          ✓ جميع خطوط النظام المسجلة وردت في هذه الفاتورة دون أي نقص!
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions */}
            <div className="pt-2 shrink-0 flex items-center justify-between gap-3 border-t border-stone-100">
              {reconResults ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportReconExcel}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير تقرير المطابقة إلى Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearRecon}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-stone-600 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                  >
                    مسح نتائج المطابقة
                  </button>
                </div>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setShowReconcileModal(false)}
                className="py-2.5 px-5 rounded-xl text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                إغلاق نافذة المطابقة
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Add Line */}
      {showAddModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-[#075073]" />
                <h3 className="font-black text-[#075073] text-base">إضافة خط موبايل جديد</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLine} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  رقم الموبايل (مثال: 01012345678) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="010xxxxxxxx"
                  value={addNumber}
                  onChange={(e) => setAddNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:outline-none focus:border-[#075073]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  الموظف المسند إليه الخط (اتركه فارغاً إن كان بالمخزن)
                </label>
                <input
                  type="text"
                  placeholder="اسم الموظف أو القسم"
                  value={addEmployee}
                  onChange={(e) => setAddEmployee(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-semibold focus:outline-none focus:border-[#075073]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-700">
                    الرقم القومي للموظف (14 رقم)
                  </label>
                  {addNationalId.trim() && (
                    <span className="text-[10px] font-bold">
                      {isValidEgyptianNationalId(addNationalId) ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>رقم قومي مصري صالح</span>
                        </span>
                      ) : (
                        <span className="text-rose-600">⚠️ يجب أن يتكون من 14 رقماً مصرياً</span>
                      )}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  maxLength={14}
                  placeholder="مثال: 29501010212345"
                  value={addNationalId}
                  onChange={(e) => setAddNationalId(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-mono font-bold tracking-wider focus:outline-none focus:border-[#075073]"
                />
                {addNationalId.trim() && isValidEgyptianNationalId(addNationalId) && (() => {
                  const meta = getNationalIdMetadata(addNationalId);
                  return meta ? (
                    <p className="text-[11px] text-[#075073] bg-blue-50 p-2 rounded-lg mt-1 border border-blue-150">
                      📅 الميلاد: <strong>{meta.birthDate}</strong> | 📍 المحافظة: <strong>{meta.governorate}</strong> | 👤 النوع: <strong>{meta.gender}</strong>
                    </p>
                  ) : null;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">نوع الباقة</label>
                  <input
                    type="text"
                    placeholder="مثال: Red Classic"
                    value={addPlan}
                    onChange={(e) => setAddPlan(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs focus:outline-none focus:border-[#075073]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">التكلفة الشهرية (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={addCost}
                    onChange={(e) => setAddCost(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:outline-none focus:border-[#075073]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  placeholder="ملاحظات حول الشريحة أو مكان الاستخدام..."
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs focus:outline-none focus:border-[#075073]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white shadow-xs transition-all cursor-pointer"
                >
                  حفظ الخط في النظام
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Dedicated Employee Sync Modal */}
      {showEmployeeSyncModal && createPortal(
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-4xl shadow-2xl border border-stone-200 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#075073] text-white flex items-center justify-center font-bold text-lg shadow-xs">
                  <Users className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#075073]">
                    ربط وتحديث بيانات الخطوط من شيت الموظفين
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    المطابقة تعتمد على «رقم الهاتف» كأساس أول ومباشر، ويتم إسناد الموظف وربط الرقم القومي إن توفر تلقائياً، دون أن يتعطل الربط في حال عدم وجوده.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEmployeeSyncModal(false);
                  setSyncPreview(null);
                }}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Instruction Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 shrink-0 mb-4 text-xs font-semibold">
              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>1. مطابقة رقم الهاتف كأساس أول وأكيد</span>
              </div>
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl text-blue-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>2. إسناد فوري للموظف وتحويل الخط لـ «نشط»</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-amber-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
                <span>3. ربط الرقم القومي إن توفر (دون تعطيل إن لم يتوفر)</span>
              </div>
            </div>

            {/* Upload Area */}
            <div className="space-y-3 shrink-0 p-4 bg-stone-50 rounded-2xl border border-dashed border-stone-300 mb-4">
              <label className="block text-xs font-bold text-stone-700">
                اختر شيت الموظفين (.xlsx, .xls, .csv):
              </label>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleEmployeeSyncUpload}
                disabled={syncLoading}
                className="w-full text-xs file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[#075073] file:text-white file:font-bold file:cursor-pointer p-1 bg-white rounded-xl border border-stone-200 cursor-pointer"
              />
              {syncLoading && (
                <div className="flex items-center gap-2 text-xs text-amber-800 font-bold animate-pulse">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                  <span>{syncStatus}</span>
                </div>
              )}
              {syncStatus && !syncLoading && <p className="text-xs text-rose-600 font-bold">{syncStatus}</p>}
            </div>

            {/* Sync Preview Section */}
            {syncPreview && (
              <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                {/* Statistics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0">
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-right">
                    <span className="text-[11px] font-bold text-emerald-800 block">خطوط سيتم إسنادها وتحديثها</span>
                    <span className="text-xl font-black font-mono text-emerald-900 block mt-0.5">{syncPreview.matchedCount}</span>
                  </div>
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-right">
                    <span className="text-[11px] font-bold text-blue-800 block">خطوط برقم قومي في الشيت</span>
                    <span className="text-xl font-black font-mono text-blue-900 block mt-0.5">{syncPreview.nidCount}</span>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-right">
                    <span className="text-[11px] font-bold text-amber-800 block">بدون رقم قومي (ستُربط بنجاح)</span>
                    <span className="text-xl font-black font-mono text-amber-900 block mt-0.5">{syncPreview.noNidCount}</span>
                  </div>
                  <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-right">
                    <span className="text-[11px] font-bold text-purple-800 block">أرقام جديدة ستضاف للنظام</span>
                    <span className="text-xl font-black font-mono text-purple-900 block mt-0.5">{syncPreview.newCount}</span>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-black text-stone-800">
                    معاينة بيانات المطابقة والإسناد ({syncPreview.items.length} رقم):
                  </h4>
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="ابحث بالرقم أو اسم الموظف أو القومي..."
                      value={syncSearch}
                      onChange={(e) => setSyncSearch(e.target.value)}
                      className="w-full pl-2 pr-8 py-1.5 bg-stone-50 rounded-lg border border-stone-200 text-xs font-medium focus:outline-none"
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="max-h-64 overflow-y-auto border border-stone-200 rounded-2xl bg-white shadow-xs">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#f8f5ee] text-[#075073] sticky top-0 font-bold border-b border-stone-200">
                      <tr>
                        <th className="py-2.5 px-3">رقم الموبايل</th>
                        <th className="py-2.5 px-3">اسم الموظف بالشيت</th>
                        <th className="py-2.5 px-3">الرقم القومي بالشيت</th>
                        <th className="py-2.5 px-3">الحالة بالنظام</th>
                        <th className="py-2.5 px-3 text-center">الإجراء المقرر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {syncPreview.items
                        .filter((it) => {
                          if (!syncSearch) return true;
                          const q = syncSearch.toLowerCase();
                          return (
                            it.number.includes(q) ||
                            (it.employeeName && it.employeeName.toLowerCase().includes(q)) ||
                            (it.nationalId && it.nationalId.includes(q)) ||
                            (it.existingEmployee && it.existingEmployee.toLowerCase().includes(q))
                          );
                        })
                        .map((it) => (
                          <tr key={it.number} className="hover:bg-stone-50/70 transition-colors">
                            <td className="py-2 px-3 font-mono font-bold text-stone-900">{it.number}</td>
                            <td className="py-2 px-3 font-bold text-stone-800">
                              {it.employeeName || <span className="text-stone-400 font-normal">— غير محدد</span>}
                            </td>
                            <td className="py-2 px-3">
                              {it.nationalId ? (
                                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                                  {it.nationalId}
                                </span>
                              ) : (
                                <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px] font-semibold">
                                  بدون رقم قومي (لا يعطل الربط)
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-stone-600">
                              {it.hasExistingLine ? (
                                <span className="text-stone-700">
                                  مسجل {it.existingEmployee ? `(مع: ${it.existingEmployee})` : '(بالمخزن)'}
                                </span>
                              ) : (
                                <span className="text-purple-700 font-semibold">+ غير مسجل (جديد)</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {it.hasExistingLine ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ✓ إسناد وتحديث الخط
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  + إضافة كخط نشط
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Action footer */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-stone-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmployeeSyncModal(false);
                      setSyncPreview(null);
                    }}
                    className="py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyEmployeeSync}
                    className="py-2.5 px-5 rounded-xl text-xs font-bold bg-[#075073] hover:bg-[#03151F] text-white shadow-md transition-all cursor-pointer flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>⚡ اعتماد وتطبيق ربط الموظفين والأرقام القومية للكل الآن</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Edit Line */}
      {editLine &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03151F]/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-[#075073]" />
                <h3 className="font-black text-[#075073] text-base">تعديل بيانات الخط {editLine.number}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditLine(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateLine} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">الموظف المسند إليه</label>
                <input
                  type="text"
                  placeholder="اسم الموظف أو اتركه فارغاً للمخزن"
                  value={editEmployee}
                  onChange={(e) => setEditEmployee(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-semibold focus:outline-none focus:border-[#075073]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-700">
                    الرقم القومي للموظف (14 رقم)
                  </label>
                  {editNationalId.trim() && (
                    <span className="text-[10px] font-bold">
                      {isValidEgyptianNationalId(editNationalId) ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>رقم قومي مصري صالح</span>
                        </span>
                      ) : (
                        <span className="text-rose-600">⚠️ يجب أن يتكون من 14 رقماً مصرياً</span>
                      )}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  maxLength={14}
                  placeholder="مثال: 29501010212345"
                  value={editNationalId}
                  onChange={(e) => setEditNationalId(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-mono font-bold tracking-wider focus:outline-none focus:border-[#075073]"
                />
                {editNationalId.trim() && isValidEgyptianNationalId(editNationalId) && (() => {
                  const meta = getNationalIdMetadata(editNationalId);
                  return meta ? (
                    <p className="text-[11px] text-[#075073] bg-blue-50 p-2 rounded-lg mt-1 border border-blue-150">
                      📅 الميلاد: <strong>{meta.birthDate}</strong> | 📍 المحافظة: <strong>{meta.governorate}</strong> | 👤 النوع: <strong>{meta.gender}</strong>
                    </p>
                  ) : null;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">الباقة</label>
                  <input
                    type="text"
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs focus:outline-none focus:border-[#075073]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">التكلفة الشهرية (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs font-mono font-bold focus:outline-none focus:border-[#075073]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">حالة الخط</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditStatus('نشط')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      editStatus === 'نشط'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-stone-50 text-stone-700 border-stone-200'
                    }`}
                  >
                    نشط ✅
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditStatus('معطل')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      editStatus === 'معطل'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-stone-50 text-stone-700 border-stone-200'
                    }`}
                  >
                    معطل ❌
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 rounded-xl border border-stone-200 text-xs focus:outline-none focus:border-[#075073]"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleDeleteLine(editLine.id)}
                  className="py-2.5 px-3 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  حذف الخط
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditLine(null)}
                    className="py-2.5 px-4 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-[#075073] to-[#03151F] hover:from-[#085a82] hover:to-[#052131] text-white shadow-xs transition-all cursor-pointer"
                  >
                    حفظ التعديلات
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
