export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      _keep_alive_log: {
        Row: {
          id: number
          pinged_at: string | null
          response_body: string | null
          response_status: number | null
          source: string | null
        }
        Insert: {
          id?: number
          pinged_at?: string | null
          response_body?: string | null
          response_status?: number | null
          source?: string | null
        }
        Update: {
          id?: number
          pinged_at?: string | null
          response_body?: string | null
          response_status?: number | null
          source?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      custom_options: {
        Row: {
          created_at: string | null
          id: string
          name: string
          price_add: number | null
          product_id: string
          required: boolean | null
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          price_add?: number | null
          product_id: string
          required?: boolean | null
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          price_add?: number | null
          product_id?: string
          required?: boolean | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_settings: {
        Row: {
          id: string
          is_holiday: boolean
          kiloan_vendor_per_kg: number
          kiloan_yayasan_per_kg: number
          non_kiloan_vendor_percent: number
          non_kiloan_yayasan_percent: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_holiday?: boolean
          kiloan_vendor_per_kg?: number
          kiloan_yayasan_per_kg?: number
          non_kiloan_vendor_percent?: number
          non_kiloan_yayasan_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_holiday?: boolean
          kiloan_vendor_per_kg?: number
          kiloan_yayasan_per_kg?: number
          non_kiloan_vendor_percent?: number
          non_kiloan_yayasan_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      laundry_orders: {
        Row: {
          admin_fee: number | null
          approved_at: string | null
          approved_by: string | null
          category: Database["public"]["Enums"]["laundry_category"]
          change_amount: number | null
          created_at: string
          id: string
          item_count: number | null
          laundry_date: string
          midtrans_order_id: string | null
          midtrans_snap_token: string | null
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          paid_by: string | null
          partner_id: string
          payment_method: string | null
          price_per_unit: number
          rejection_reason: string | null
          rounding_applied: number | null
          rounding_type: Database["public"]["Enums"]["rounding_policy"] | null
          staff_id: string
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          total_price: number
          updated_at: string
          vendor_share: number
          wadiah_used: number | null
          weight_kg: number | null
          yayasan_share: number
        }
        Insert: {
          admin_fee?: number | null
          approved_at?: string | null
          approved_by?: string | null
          category: Database["public"]["Enums"]["laundry_category"]
          change_amount?: number | null
          created_at?: string
          id?: string
          item_count?: number | null
          laundry_date?: string
          midtrans_order_id?: string | null
          midtrans_snap_token?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          partner_id: string
          payment_method?: string | null
          price_per_unit: number
          rejection_reason?: string | null
          rounding_applied?: number | null
          rounding_type?: Database["public"]["Enums"]["rounding_policy"] | null
          staff_id: string
          status?: Database["public"]["Enums"]["order_status"]
          student_id: string
          total_price: number
          updated_at?: string
          vendor_share?: number
          wadiah_used?: number | null
          weight_kg?: number | null
          yayasan_share?: number
        }
        Update: {
          admin_fee?: number | null
          approved_at?: string | null
          approved_by?: string | null
          category?: Database["public"]["Enums"]["laundry_category"]
          change_amount?: number | null
          created_at?: string
          id?: string
          item_count?: number | null
          laundry_date?: string
          midtrans_order_id?: string | null
          midtrans_snap_token?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          partner_id?: string
          payment_method?: string | null
          price_per_unit?: number
          rejection_reason?: string | null
          rounding_applied?: number | null
          rounding_type?: Database["public"]["Enums"]["rounding_policy"] | null
          staff_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          student_id?: string
          total_price?: number
          updated_at?: string
          vendor_share?: number
          wadiah_used?: number | null
          weight_kg?: number | null
          yayasan_share?: number
        }
        Relationships: [
          {
            foreignKeyName: "laundry_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "laundry_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_partners: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      laundry_prices: {
        Row: {
          category: Database["public"]["Enums"]["laundry_category"]
          created_at: string
          id: string
          price_per_unit: number
          unit_name: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["laundry_category"]
          created_at?: string
          id?: string
          price_per_unit: number
          unit_name?: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["laundry_category"]
          created_at?: string
          id?: string
          price_per_unit?: number
          unit_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_variations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          product_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          product_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          category: string
          created_at: string | null
          description: string
          id: string
          image: string | null
          is_available: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          base_price?: number
          category: string
          created_at?: string | null
          description: string
          id?: string
          image?: string | null
          is_available?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          image?: string | null
          is_available?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rounding_settings: {
        Row: {
          default_policy: Database["public"]["Enums"]["rounding_policy"]
          id: string
          minimum_usage_balance: number
          parent_online_payment_enabled: boolean
          policy_info_text: string
          rounding_multiple: number
          show_policy_at_start: boolean
          updated_at: string
          updated_by: string | null
          wadiah_enabled: boolean
        }
        Insert: {
          default_policy?: Database["public"]["Enums"]["rounding_policy"]
          id?: string
          minimum_usage_balance?: number
          parent_online_payment_enabled?: boolean
          policy_info_text?: string
          rounding_multiple?: number
          show_policy_at_start?: boolean
          updated_at?: string
          updated_by?: string | null
          wadiah_enabled?: boolean
        }
        Update: {
          default_policy?: Database["public"]["Enums"]["rounding_policy"]
          id?: string
          minimum_usage_balance?: number
          parent_online_payment_enabled?: boolean
          policy_info_text?: string
          rounding_multiple?: number
          show_policy_at_start?: boolean
          updated_at?: string
          updated_by?: string | null
          wadiah_enabled?: boolean
        }
        Relationships: []
      }
      student_wadiah_balance: {
        Row: {
          balance: number
          created_at: string
          id: string
          last_transaction_at: string | null
          student_id: string
          total_deposited: number
          total_sedekah: number
          total_used: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          last_transaction_at?: string | null
          student_id: string
          total_deposited?: number
          total_sedekah?: number
          total_used?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          last_transaction_at?: string | null
          student_id?: string
          total_deposited?: number
          total_sedekah?: number
          total_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_wadiah_balance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          class: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          nik: string
          parent_id: string | null
          student_code: string
          updated_at: string
        }
        Insert: {
          class: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          nik: string
          parent_id?: string | null
          student_code: string
          updated_at?: string
        }
        Update: {
          class?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          nik?: string
          parent_id?: string | null
          student_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variation_options: {
        Row: {
          created_at: string | null
          id: string
          name: string
          price_add: number | null
          variation_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          price_add?: number | null
          variation_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          price_add?: number | null
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variation_options_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      wadiah_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          customer_consent: boolean | null
          id: string
          notes: string | null
          order_id: string | null
          original_amount: number | null
          processed_by: string | null
          rounded_amount: number | null
          rounding_difference: number | null
          student_id: string
          transaction_type: Database["public"]["Enums"]["wadiah_transaction_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          customer_consent?: boolean | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_amount?: number | null
          processed_by?: string | null
          rounded_amount?: number | null
          rounding_difference?: number | null
          student_id: string
          transaction_type: Database["public"]["Enums"]["wadiah_transaction_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          customer_consent?: boolean | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_amount?: number | null
          processed_by?: string | null
          rounded_amount?: number | null
          rounding_difference?: number | null
          student_id?: string
          transaction_type?: Database["public"]["Enums"]["wadiah_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "wadiah_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "laundry_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wadiah_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_rounded_amount: {
        Args: {
          p_amount: number
          p_round_down?: boolean
          p_rounding_multiple?: number
        }
        Returns: number
      }
      check_nik_available: {
        Args: { p_exclude_id?: string; p_nik: string }
        Returns: Json
      }
      claim_student: {
        Args: { p_parent_id: string; p_student_id: string }
        Returns: Json
      }
      cleanup_keep_alive_logs: { Args: never; Returns: undefined }
      find_potential_duplicate_students: {
        Args: {
          p_class?: string
          p_exclude_id?: string
          p_name: string
          p_nik?: string
        }
        Returns: {
          class: string
          id: string
          is_active: boolean
          match_type: string
          name: string
          nik: string
          parent_id: string
          similarity_score: number
          student_code: string
        }[]
      }
      fix_all_order_prices: { Args: never; Returns: number }
      get_or_create_wadiah_balance: {
        Args: { p_student_id: string }
        Returns: {
          balance: number
          created_at: string
          id: string
          last_transaction_at: string | null
          student_id: string
          total_deposited: number
          total_sedekah: number
          total_used: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_wadiah_balance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_partner_student_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_parent_of_student: { Args: { p_student_id: string }; Returns: boolean }
      keep_alive_ping: { Args: never; Returns: Json }
      merge_duplicate_students: {
        Args: { p_keep_id: string; p_merge_ids: string[] }
        Returns: Json
      }
      parent_pay_order_with_wadiah: {
        Args: {
          p_order_id: string
          p_student_id: string
          p_wadiah_amount: number
        }
        Returns: Json
      }
      parent_use_wadiah_for_payment: {
        Args: { p_amount: number; p_order_id: string; p_student_id: string }
        Returns: Json
      }
      process_wadiah_transaction: {
        Args: {
          p_amount: number
          p_customer_consent?: boolean
          p_notes?: string
          p_order_id?: string
          p_original_amount?: number
          p_processed_by?: string
          p_rounded_amount?: number
          p_student_id: string
          p_transaction_type: Database["public"]["Enums"]["wadiah_transaction_type"]
        }
        Returns: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          customer_consent: boolean | null
          id: string
          notes: string | null
          order_id: string | null
          original_amount: number | null
          processed_by: string | null
          rounded_amount: number | null
          rounding_difference: number | null
          student_id: string
          transaction_type: Database["public"]["Enums"]["wadiah_transaction_type"]
        }
        SetofOptions: {
          from: "*"
          to: "wadiah_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recalculate_all_order_prices: {
        Args: never
        Returns: {
          new_total: number
          new_vendor: number
          new_yayasan: number
          old_total: number
          old_vendor: number
          old_yayasan: number
          order_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "parent" | "staff" | "partner" | "cashier"
      laundry_category:
        | "kiloan"
        | "handuk"
        | "selimut"
        | "sprei_kecil"
        | "sprei_besar"
        | "jaket_tebal"
        | "bedcover"
      order_status:
        | "DRAFT"
        | "MENUNGGU_APPROVAL_MITRA"
        | "DITOLAK_MITRA"
        | "DISETUJUI_MITRA"
        | "MENUNGGU_PEMBAYARAN"
        | "DIBAYAR"
        | "SELESAI"
      rounding_policy: "none" | "round_down" | "round_up_ask" | "to_wadiah"
      wadiah_transaction_type:
        | "deposit"
        | "change_deposit"
        | "payment"
        | "refund"
        | "adjustment"
        | "sedekah"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

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
} as const
