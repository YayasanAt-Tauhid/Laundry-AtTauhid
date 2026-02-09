import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ArrearsOrder {
  id: string;
  category: string;
  total_price: number;
  laundry_date: string;
  weight_kg: number | null;
  item_count: number | null;
}

export interface StudentArrears {
  studentId: string;
  studentName: string;
  studentClass: string;
  nik: string;
  parentName: string | null;
  parentPhone: string | null;
  orders: ArrearsOrder[];
  totalAmount: number;
  orderCount: number;
}

export function useArrearsData() {
  const [data, setData] = useState<StudentArrears[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const { toast } = useToast();

  const fetchArrears = async () => {
    setLoading(true);
    try {
      // Fetch unpaid orders with student + parent info
      const { data: orders, error } = await supabase
        .from("laundry_orders")
        .select(`
          id, category, total_price, laundry_date, weight_kg, item_count,
          students!inner(id, name, class, nik, parent_id)
        `)
        .in("status", ["DISETUJUI_MITRA", "MENUNGGU_PEMBAYARAN"])
        .order("laundry_date", { ascending: false });

      if (error) throw error;

      // Group by student
      const studentMap = new Map<string, StudentArrears>();

      for (const order of orders || []) {
        const student = (order as any).students;
        if (!student) continue;

        const key = student.id;
        if (!studentMap.has(key)) {
          studentMap.set(key, {
            studentId: student.id,
            studentName: student.name,
            studentClass: student.class,
            nik: student.nik,
            parentName: null,
            parentPhone: null,
            orders: [],
            totalAmount: 0,
            orderCount: 0,
          });
        }

        const entry = studentMap.get(key)!;
        entry.orders.push({
          id: order.id,
          category: order.category,
          total_price: order.total_price,
          laundry_date: order.laundry_date,
          weight_kg: order.weight_kg,
          item_count: order.item_count,
        });
        entry.totalAmount += order.total_price;
        entry.orderCount += 1;
      }

      // Fetch parent profiles for students that have parent_id
      const parentIds = new Set<string>();
      for (const order of orders || []) {
        const student = (order as any).students;
        if (student?.parent_id) parentIds.add(student.parent_id);
      }

      if (parentIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, phone")
          .in("user_id", Array.from(parentIds));

        const profileMap = new Map<string, { full_name: string; phone: string | null }>();
        for (const p of profiles || []) {
          profileMap.set(p.user_id, { full_name: p.full_name, phone: p.phone });
        }

        // Map parent info back
        for (const order of orders || []) {
          const student = (order as any).students;
          if (student?.parent_id && profileMap.has(student.parent_id)) {
            const entry = studentMap.get(student.id);
            if (entry) {
              const parent = profileMap.get(student.parent_id)!;
              entry.parentName = parent.full_name;
              entry.parentPhone = parent.phone;
            }
          }
        }
      }

      setData(Array.from(studentMap.values()).sort((a, b) => b.totalAmount - a.totalAmount));
    } catch (err) {
      console.error("Failed to fetch arrears:", err);
      toast({ title: "Gagal memuat data tunggakan", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArrears();
  }, []);

  const classes = useMemo(() => {
    const set = new Set(data.map((d) => d.studentClass));
    return Array.from(set).sort();
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesClass = classFilter === "all" || item.studentClass === classFilter;
      const matchesSearch =
        !searchQuery ||
        item.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.nik.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesClass && matchesSearch;
    });
  }, [data, searchQuery, classFilter]);

  return {
    data: filteredData,
    allData: data,
    loading,
    searchQuery,
    setSearchQuery,
    classFilter,
    setClassFilter,
    classes,
    refetch: fetchArrears,
  };
}
