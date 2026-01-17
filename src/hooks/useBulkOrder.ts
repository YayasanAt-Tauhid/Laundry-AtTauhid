import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LAUNDRY_CATEGORIES, type LaundryCategory } from "@/lib/constants";

// Types
export interface Student {
  id: string;
  nik: string;
  name: string;
  class: string;
}

export interface Partner {
  id: string;
  name: string;
}

export interface RevenueConfig {
  kiloan_yayasan_per_kg: number;
  kiloan_vendor_per_kg: number;
  non_kiloan_yayasan_percent: number;
  non_kiloan_vendor_percent: number;
}

export interface RowValidationError {
  field: "student" | "partner" | "date" | "category" | "quantity";
  message: string;
}

export interface BulkOrderRow {
  id: string;
  rowNumber: number;
  // Student info
  studentId: string;
  studentNik: string;
  studentName: string;
  studentClass: string;
  // Order details
  partnerId: string;
  laundryDate: string;
  category: LaundryCategory | "";
  weightKg: string;
  itemCount: string;
  notes: string;
  // Computed
  pricePerUnit: number;
  totalPrice: number;
  yayasanShare: number;
  vendorShare: number;
  // Validation
  isValid: boolean;
  errors: RowValidationError[];
  // UI State
  isDirty: boolean;
  isSubmitted: boolean;
}

export interface SubmitResult {
  success: number;
  failed: number;
  errors: string[];
}

const createEmptyRow = (rowNumber: number): BulkOrderRow => ({
  id: crypto.randomUUID(),
  rowNumber,
  studentId: "",
  studentNik: "",
  studentName: "",
  studentClass: "",
  partnerId: "",
  laundryDate: new Date().toISOString().split("T")[0],
  category: "",
  weightKg: "",
  itemCount: "",
  notes: "",
  pricePerUnit: 0,
  totalPrice: 0,
  yayasanShare: 0,
  vendorShare: 0,
  isValid: false,
  errors: [],
  isDirty: false,
  isSubmitted: false,
});

const validateRow = (row: BulkOrderRow): RowValidationError[] => {
  const errors: RowValidationError[] = [];

  if (!row.studentId) {
    errors.push({ field: "student", message: "Pilih siswa" });
  }

  if (!row.partnerId) {
    errors.push({ field: "partner", message: "Pilih mitra" });
  }

  if (!row.laundryDate) {
    errors.push({ field: "date", message: "Pilih tanggal" });
  } else {
    const date = new Date(row.laundryDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (date > today) {
      errors.push({
        field: "date",
        message: "Tanggal tidak boleh di masa depan",
      });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (date < thirtyDaysAgo) {
      errors.push({ field: "date", message: "Maks 30 hari lalu" });
    }
  }

  if (!row.category) {
    errors.push({ field: "category", message: "Pilih kategori" });
  }

  if (row.category) {
    const isKiloan = row.category === "kiloan";
    if (isKiloan) {
      const weight = parseFloat(row.weightKg);
      if (isNaN(weight) || weight <= 0) {
        errors.push({ field: "quantity", message: "Masukkan berat" });
      } else if (weight > 50) {
        errors.push({ field: "quantity", message: "Maks 50 kg" });
      }
    } else {
      const count = parseInt(row.itemCount);
      if (isNaN(count) || count <= 0) {
        errors.push({ field: "quantity", message: "Masukkan jumlah" });
      } else if (count > 100) {
        errors.push({ field: "quantity", message: "Maks 100 pcs" });
      }
    }
  }

  return errors;
};

const calculateRowPrices = (
  row: BulkOrderRow,
  config: RevenueConfig | null,
): {
  pricePerUnit: number;
  totalPrice: number;
  yayasanShare: number;
  vendorShare: number;
} => {
  if (!row.category || !config) {
    return { pricePerUnit: 0, totalPrice: 0, yayasanShare: 0, vendorShare: 0 };
  }

  const pricePerUnit = LAUNDRY_CATEGORIES[row.category].price;
  const isKiloan = row.category === "kiloan";
  const quantity = isKiloan
    ? parseFloat(row.weightKg) || 0
    : parseInt(row.itemCount) || 0;

  const totalPrice = Math.round(pricePerUnit * quantity);

  let yayasanShare: number;
  let vendorShare: number;

  if (isKiloan) {
    yayasanShare = Math.round(config.kiloan_yayasan_per_kg * quantity);
    vendorShare = Math.round(config.kiloan_vendor_per_kg * quantity);
  } else {
    yayasanShare = Math.round(
      totalPrice * (config.non_kiloan_yayasan_percent / 100),
    );
    vendorShare = Math.round(
      totalPrice * (config.non_kiloan_vendor_percent / 100),
    );
  }

  return { pricePerUnit, totalPrice, yayasanShare, vendorShare };
};

export function useBulkOrder(staffId: string | undefined) {
  // Data states
  const [rows, setRows] = useState<BulkOrderRow[]>(() => [createEmptyRow(1)]);
  const [students, setStudents] = useState<Student[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [revenueConfig, setRevenueConfig] = useState<RevenueConfig | null>(
    null,
  );

  // Loading states
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState({
    total: 0,
    completed: 0,
    failed: 0,
  });

  // Fetch initial data
  const fetchInitialData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [studentsRes, partnersRes, configRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, nik, name, class")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("laundry_partners")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("holiday_settings")
          .select(
            "kiloan_yayasan_per_kg, kiloan_vendor_per_kg, non_kiloan_yayasan_percent, non_kiloan_vendor_percent",
          )
          .single(),
      ]);

      if (studentsRes.data) setStudents(studentsRes.data);
      if (partnersRes.data) setPartners(partnersRes.data);
      if (configRes.data) {
        setRevenueConfig({
          kiloan_yayasan_per_kg: configRes.data.kiloan_yayasan_per_kg,
          kiloan_vendor_per_kg: configRes.data.kiloan_vendor_per_kg,
          non_kiloan_yayasan_percent: configRes.data.non_kiloan_yayasan_percent,
          non_kiloan_vendor_percent: configRes.data.non_kiloan_vendor_percent,
        });
      }
    } catch (error) {
      console.error("Error fetching initial data:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  // Update row
  const updateRow = useCallback(
    (rowId: string, updates: Partial<BulkOrderRow>) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row;

          const updatedRow = { ...row, ...updates, isDirty: true };

          // Recalculate prices if category or quantity changed
          if (
            "category" in updates ||
            "weightKg" in updates ||
            "itemCount" in updates
          ) {
            const prices = calculateRowPrices(updatedRow, revenueConfig);
            Object.assign(updatedRow, prices);
          }

          // Revalidate
          const errors = validateRow(updatedRow);
          updatedRow.errors = errors;
          updatedRow.isValid = errors.length === 0;

          return updatedRow;
        }),
      );
    },
    [revenueConfig],
  );

  // Set student for a row
  const setRowStudent = useCallback(
    (rowId: string, student: Student | null) => {
      if (student) {
        updateRow(rowId, {
          studentId: student.id,
          studentNik: student.nik,
          studentName: student.name,
          studentClass: student.class,
        });
      } else {
        updateRow(rowId, {
          studentId: "",
          studentNik: "",
          studentName: "",
          studentClass: "",
        });
      }
    },
    [updateRow],
  );

  // Add row
  const addRow = useCallback((count: number = 1) => {
    setRows((prev) => {
      const newRows: BulkOrderRow[] = [];
      for (let i = 0; i < count; i++) {
        newRows.push(createEmptyRow(prev.length + i + 1));
      }
      return [...prev, ...newRows];
    });
  }, []);

  // Remove row
  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => {
      const filtered = prev.filter((r) => r.id !== rowId);
      // Renumber rows
      return filtered.map((row, index) => ({
        ...row,
        rowNumber: index + 1,
      }));
    });
  }, []);

  // Duplicate row
  const duplicateRow = useCallback((rowId: string) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.id === rowId);
      if (index === -1) return prev;

      const original = prev[index];
      const duplicate: BulkOrderRow = {
        ...original,
        id: crypto.randomUUID(),
        rowNumber: prev.length + 1,
        isSubmitted: false,
      };

      return [...prev, duplicate];
    });
  }, []);

  // Clear empty rows
  const clearEmptyRows = useCallback(() => {
    setRows((prev) => {
      const nonEmpty = prev.filter(
        (r) => r.studentId || r.partnerId || r.category,
      );
      if (nonEmpty.length === 0) {
        return [createEmptyRow(1)];
      }
      return nonEmpty.map((row, index) => ({
        ...row,
        rowNumber: index + 1,
      }));
    });
  }, []);

  // Clear all rows
  const clearAllRows = useCallback(() => {
    setRows([createEmptyRow(1)]);
  }, []);

  // Get valid rows
  const validRows = useMemo(
    () => rows.filter((r) => r.isValid && !r.isSubmitted),
    [rows],
  );

  // Get summary
  const summary = useMemo(() => {
    const valid = validRows;
    const empty = rows.filter(
      (r) => !r.studentId && !r.partnerId && !r.category && !r.isSubmitted,
    );
    const invalid = rows.filter(
      (r) =>
        !r.isValid &&
        !r.isSubmitted &&
        (r.studentId || r.partnerId || r.category),
    );
    const submitted = rows.filter((r) => r.isSubmitted);

    const totalPrice = valid.reduce((sum, r) => sum + r.totalPrice, 0);
    const totalYayasan = valid.reduce((sum, r) => sum + r.yayasanShare, 0);
    const totalVendor = valid.reduce((sum, r) => sum + r.vendorShare, 0);

    // Count by category
    const byCategory: Record<string, number> = {};
    valid.forEach((r) => {
      if (r.category) {
        byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      }
    });

    return {
      validCount: valid.length,
      emptyCount: empty.length,
      invalidCount: invalid.length,
      submittedCount: submitted.length,
      totalRows: rows.length,
      totalPrice,
      totalYayasan,
      totalVendor,
      byCategory,
    };
  }, [rows, validRows]);

  // Submit orders
  const submitOrders = useCallback(async (): Promise<SubmitResult> => {
    if (!staffId || validRows.length === 0) {
      return { success: 0, failed: 0, errors: ["Tidak ada data valid"] };
    }

    setIsSubmitting(true);
    setSubmitProgress({ total: validRows.length, completed: 0, failed: 0 });

    const result: SubmitResult = { success: 0, failed: 0, errors: [] };
    const BATCH_SIZE = 20;

    try {
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, i + BATCH_SIZE);

        const ordersToInsert = batch.map((row) => ({
          student_id: row.studentId,
          partner_id: row.partnerId,
          staff_id: staffId,
          category: row.category as LaundryCategory, // Safe cast - validRows always have category
          weight_kg:
            row.category === "kiloan" ? parseFloat(row.weightKg) : null,
          item_count:
            row.category !== "kiloan" ? parseInt(row.itemCount) : null,
          price_per_unit: row.pricePerUnit,
          total_price: row.totalPrice,
          yayasan_share: row.yayasanShare,
          vendor_share: row.vendorShare,
          status: "MENUNGGU_APPROVAL_MITRA" as const,
          notes: row.notes || null,
          laundry_date: row.laundryDate,
        }));

        const { data, error } = await supabase
          .from("laundry_orders")
          .insert(ordersToInsert)
          .select("id");

        if (error) {
          result.failed += batch.length;
          result.errors.push(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`,
          );
        } else {
          result.success += data?.length || 0;

          // Mark rows as submitted
          const submittedIds = batch.map((r) => r.id);
          setRows((prev) =>
            prev.map((row) =>
              submittedIds.includes(row.id)
                ? { ...row, isSubmitted: true }
                : row,
            ),
          );
        }

        setSubmitProgress({
          total: validRows.length,
          completed: result.success,
          failed: result.failed,
        });
      }
    } catch (error) {
      console.error("Submit error:", error);
      result.errors.push(
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setIsSubmitting(false);
    }

    return result;
  }, [staffId, validRows]);

  // Search students by NIK or name
  const searchStudents = useCallback(
    (query: string): Student[] => {
      if (!query || query.length < 2) return students.slice(0, 10);

      const q = query.toLowerCase().trim();

      return students
        .filter(
          (s) =>
            s.nik.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
        )
        .sort((a, b) => {
          // Prioritize exact NIK match
          if (a.nik.toLowerCase() === q) return -1;
          if (b.nik.toLowerCase() === q) return 1;
          // Then NIK starts with
          if (a.nik.toLowerCase().startsWith(q)) return -1;
          if (b.nik.toLowerCase().startsWith(q)) return 1;
          // Then exact name
          if (a.name.toLowerCase() === q) return -1;
          if (b.name.toLowerCase() === q) return 1;
          // Default alphabetical
          return a.name.localeCompare(b.name);
        })
        .slice(0, 10);
    },
    [students],
  );

  return {
    // Data
    rows,
    students,
    partners,
    revenueConfig,
    validRows,
    summary,

    // Loading states
    isLoadingData,
    isSubmitting,
    submitProgress,

    // Actions
    fetchInitialData,
    updateRow,
    setRowStudent,
    addRow,
    removeRow,
    duplicateRow,
    clearEmptyRows,
    clearAllRows,
    submitOrders,
    searchStudents,
  };
}
