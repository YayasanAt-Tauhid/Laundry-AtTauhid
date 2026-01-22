export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1";
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          new_data: Json | null;
          old_data: Json | null;
          record_id: string;
          table_name: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id: string;
          table_name: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id?: string;
          table_name?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      holiday_settings: {
        Row: {
          id: string;
          is_holiday: boolean;
          updated_at: string;
          updated_by: string | null;
          kiloan_yayasan_per_kg: number;
          kiloan_vendor_per_kg: number;
          non_kiloan_yayasan_percent: number;
          non_kiloan_vendor_percent: number;
        };
        Insert: {
          id?: string;
          is_holiday?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          kiloan_yayasan_per_kg?: number;
          kiloan_vendor_per_kg?: number;
          non_kiloan_yayasan_percent?: number;
          non_kiloan_vendor_percent?: number;
        };
        Update: {
          id?: string;
          is_holiday?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          kiloan_yayasan_per_kg?: number;
          kiloan_vendor_per_kg?: number;
          non_kiloan_yayasan_percent?: number;
          non_kiloan_vendor_percent?: number;
        };
        Relationships: [];
      };
      laundry_orders: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          category: Database["public"]["Enums"]["laundry_category"];
          created_at: string;
          id: string;
          item_count: number | null;
          laundry_date: string;
          midtrans_order_id: string | null;
          midtrans_snap_token: string | null;
          notes: string | null;
          paid_at: string | null;
          admin_fee: number;
          payment_method: string | null;
          paid_amount: number | null;
          change_amount: number;
          wadiah_used: number;
          rounding_applied: number;
          rounding_type: Database["public"]["Enums"]["rounding_policy"] | null;
          partner_id: string;
          price_per_unit: number;
          rejection_reason: string | null;
          staff_id: string;
          status: Database["public"]["Enums"]["order_status"];
          student_id: string;
          total_price: number;
          updated_at: string;
          vendor_share: number;
          weight_kg: number | null;
          yayasan_share: number;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          category: Database["public"]["Enums"]["laundry_category"];
          created_at?: string;
          id?: string;
          item_count?: number | null;
          laundry_date?: string;
          midtrans_order_id?: string | null;
          midtrans_snap_token?: string | null;
          notes?: string | null;
          paid_at?: string | null;
          admin_fee?: number;
          payment_method?: string | null;
          paid_amount?: number | null;
          change_amount?: number;
          wadiah_used?: number;
          rounding_applied?: number;
          rounding_type?: Database["public"]["Enums"]["rounding_policy"] | null;
          partner_id: string;
          price_per_unit: number;
          rejection_reason?: string | null;
          staff_id: string;
          status?: Database["public"]["Enums"]["order_status"];
          student_id: string;
          total_price: number;
          updated_at?: string;
          vendor_share?: number;
          weight_kg?: number | null;
          yayasan_share?: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          category?: Database["public"]["Enums"]["laundry_category"];
          created_at?: string;
          id?: string;
          item_count?: number | null;
          laundry_date?: string;
          midtrans_order_id?: string | null;
          midtrans_snap_token?: string | null;
          notes?: string | null;
          paid_at?: string | null;
          admin_fee?: number;
          payment_method?: string | null;
          paid_amount?: number | null;
          change_amount?: number;
          wadiah_used?: number;
          rounding_applied?: number;
          rounding_type?: Database["public"]["Enums"]["rounding_policy"] | null;
          partner_id?: string;
          price_per_unit?: number;
          rejection_reason?: string | null;
          staff_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          student_id?: string;
          total_price?: number;
          updated_at?: string;
          vendor_share?: number;
          weight_kg?: number | null;
          yayasan_share?: number;
        };
        Relationships: [
          {
            foreignKeyName: "laundry_orders_partner_id_fkey";
            columns: ["partner_id"];
            isOneToOne: false;
            referencedRelation: "laundry_partners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "laundry_orders_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      laundry_partners: {
        Row: {
          address: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          phone: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          phone?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          phone?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      laundry_prices: {
        Row: {
          category: Database["public"]["Enums"]["laundry_category"];
          created_at: string;
          id: string;
          price_per_unit: number;
          unit_name: string;
          updated_at: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["laundry_category"];
          created_at?: string;
          id?: string;
          price_per_unit: number;
          unit_name?: string;
          updated_at?: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["laundry_category"];
          created_at?: string;
          id?: string;
          price_per_unit?: number;
          unit_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      students: {
        Row: {
          class: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          nik: string;
          parent_id: string;
          student_code: string;
          updated_at: string;
        };
        Insert: {
          class: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          nik: string;
          parent_id: string;
          student_code?: string;
          updated_at?: string;
        };
        Update: {
          class?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          nik?: string;
          parent_id?: string;
          student_code?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      student_wadiah_balance: {
        Row: {
          id: string;
          student_id: string;
          balance: number;
          total_deposited: number;
          total_used: number;
          total_sedekah: number;
          last_transaction_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          balance?: number;
          total_deposited?: number;
          total_used?: number;
          total_sedekah?: number;
          last_transaction_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          balance?: number;
          total_deposited?: number;
          total_used?: number;
          total_sedekah?: number;
          last_transaction_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_wadiah_balance_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: true;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      wadiah_transactions: {
        Row: {
          id: string;
          student_id: string;
          transaction_type: Database["public"]["Enums"]["wadiah_transaction_type"];
          amount: number;
          balance_before: number;
          balance_after: number;
          order_id: string | null;
          original_amount: number | null;
          rounded_amount: number | null;
          rounding_difference: number | null;
          notes: string | null;
          processed_by: string | null;
          customer_consent: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          transaction_type: Database["public"]["Enums"]["wadiah_transaction_type"];
          amount: number;
          balance_before: number;
          balance_after: number;
          order_id?: string | null;
          original_amount?: number | null;
          rounded_amount?: number | null;
          rounding_difference?: number | null;
          notes?: string | null;
          processed_by?: string | null;
          customer_consent?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          transaction_type?: Database["public"]["Enums"]["wadiah_transaction_type"];
          amount?: number;
          balance_before?: number;
          balance_after?: number;
          order_id?: string | null;
          original_amount?: number | null;
          rounded_amount?: number | null;
          rounding_difference?: number | null;
          notes?: string | null;
          processed_by?: string | null;
          customer_consent?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wadiah_transactions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wadiah_transactions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "laundry_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      rounding_settings: {
        Row: {
          id: string;
          default_policy: Database["public"]["Enums"]["rounding_policy"];
          rounding_multiple: number;
          wadiah_enabled: boolean;
          minimum_usage_balance: number;
          policy_info_text: string;
          show_policy_at_start: boolean;
          parent_online_payment_enabled: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          default_policy?: Database["public"]["Enums"]["rounding_policy"];
          rounding_multiple?: number;
          wadiah_enabled?: boolean;
          minimum_usage_balance?: number;
          policy_info_text?: string;
          show_policy_at_start?: boolean;
          parent_online_payment_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          default_policy?: Database["public"]["Enums"]["rounding_policy"];
          rounding_multiple?: number;
          wadiah_enabled?: boolean;
          minimum_usage_balance?: number;
          policy_info_text?: string;
          show_policy_at_start?: boolean;
          parent_online_payment_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_partner_student_ids: {
        Args: { _user_id: string };
        Returns: string[];
      };
      get_user_role: {
        Args: { _user_id: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      get_or_create_wadiah_balance: {
        Args: { p_student_id: string };
        Returns: {
          id: string;
          student_id: string;
          balance: number;
          total_deposited: number;
          total_used: number;
          total_sedekah: number;
          last_transaction_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      process_wadiah_transaction: {
        Args: {
          p_student_id: string;
          p_transaction_type: Database["public"]["Enums"]["wadiah_transaction_type"];
          p_amount: number;
          p_order_id?: string | null;
          p_notes?: string | null;
          p_processed_by?: string | null;
          p_customer_consent?: boolean;
          p_original_amount?: number | null;
          p_rounded_amount?: number | null;
        };
        Returns: {
          id: string;
          student_id: string;
          transaction_type: Database["public"]["Enums"]["wadiah_transaction_type"];
          amount: number;
          balance_before: number;
          balance_after: number;
          order_id: string | null;
          original_amount: number | null;
          rounded_amount: number | null;
          rounding_difference: number | null;
          notes: string | null;
          processed_by: string | null;
          customer_consent: boolean;
          created_at: string;
        };
      };
      calculate_rounded_amount: {
        Args: {
          p_amount: number;
          p_rounding_multiple?: number;
          p_round_down?: boolean;
        };
        Returns: number;
      };
      check_nik_available: {
        Args: {
          p_nik: string;
          p_exclude_id?: string | null;
        };
        Returns: {
          available: boolean;
          message: string;
          existing_student?: {
            id: string;
            name: string;
            class: string;
            student_code: string;
            is_active: boolean;
          } | null;
        };
      };
      find_potential_duplicate_students: {
        Args: {
          p_name: string;
          p_class?: string | null;
          p_nik?: string | null;
          p_exclude_id?: string | null;
        };
        Returns: {
          id: string;
          name: string;
          class: string;
          nik: string;
          student_code: string;
          parent_id: string;
          is_active: boolean;
          match_type: string;
          similarity_score: number;
        }[];
      };
      merge_duplicate_students: {
        Args: {
          p_keep_id: string;
          p_merge_ids: string[];
        };
        Returns: {
          success: boolean;
          message?: string;
          error?: string;
          details?: {
            keep_student: {
              id: string;
              name: string;
              student_code: string;
            };
            orders_updated: number;
            wadiah_balance_transferred: number;
            students_deactivated: number;
          };
        };
      };
      parent_use_wadiah_for_payment: {
        Args: {
          p_student_id: string;
          p_order_id: string;
          p_amount: number;
        };
        Returns: {
          success: boolean;
          error?: string;
          transaction_id?: string;
          amount_used?: number;
          balance_before?: number;
          balance_after?: number;
          order_id?: string;
        };
      };
      parent_pay_order_with_wadiah: {
        Args: {
          p_student_id: string;
          p_order_id: string;
          p_wadiah_amount: number;
        };
        Returns: {
          success: boolean;
          error?: string;
          payment_complete?: boolean;
          wadiah_used?: number;
          remaining_amount?: number;
          order_status?: string;
          message?: string;
        };
      };
    };
    Enums: {
      app_role: "admin" | "parent" | "staff" | "partner" | "cashier";
      laundry_category:
        | "kiloan"
        | "handuk"
        | "selimut"
        | "sprei_kecil"
        | "sprei_besar"
        | "jaket_tebal"
        | "bedcover";
      order_status:
        | "DRAFT"
        | "MENUNGGU_APPROVAL_MITRA"
        | "DITOLAK_MITRA"
        | "DISETUJUI_MITRA"
        | "MENUNGGU_PEMBAYARAN"
        | "DIBAYAR"
        | "SELESAI";
      rounding_policy: "none" | "round_down" | "round_up_ask" | "to_wadiah";
      wadiah_transaction_type:
        | "deposit"
        | "change_deposit"
        | "payment"
        | "refund"
        | "adjustment"
        | "sedekah";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

// Wadiah System Types
export type RoundingPolicy = Database["public"]["Enums"]["rounding_policy"];
export type WadiahTransactionType =
  Database["public"]["Enums"]["wadiah_transaction_type"];
export type StudentWadiahBalance = Tables<"student_wadiah_balance">;
export type WadiahTransaction = Tables<"wadiah_transactions">;
export type RoundingSettings = Tables<"rounding_settings">;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "parent", "staff", "partner", "cashier"],
      laundry_category: [
        "kiloan",
        "handuk",
        "selimut",
        "sprei_kecil",
        "sprei_besar",
        "jaket_tebal",
        "bedcover",
      ],
      order_status: [
        "DRAFT",
        "MENUNGGU_APPROVAL_MITRA",
        "DITOLAK_MITRA",
        "DISETUJUI_MITRA",
        "MENUNGGU_PEMBAYARAN",
        "DIBAYAR",
        "SELESAI",
      ],
      rounding_policy: ["none", "round_down", "round_up_ask", "to_wadiah"],
      wadiah_transaction_type: [
        "deposit",
        "change_deposit",
        "payment",
        "refund",
        "adjustment",
        "sedekah",
      ],
    },
  },
} as const;
