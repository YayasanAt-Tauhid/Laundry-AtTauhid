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
      holiday_settings: {
        Row: {
          id: string
          is_holiday: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_holiday?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_holiday?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      laundry_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category: Database["public"]["Enums"]["laundry_category"]
          created_at: string
          id: string
          item_count: number | null
          laundry_date: string
          midtrans_order_id: string | null
          midtrans_snap_token: string | null
          notes: string | null
          paid_at: string | null
          admin_fee: number
          payment_method: string | null
          partner_id: string
          price_per_unit: number
          rejection_reason: string | null
          staff_id: string
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          total_price: number
          updated_at: string
          vendor_share: number
          weight_kg: number | null
          yayasan_share: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category: Database["public"]["Enums"]["laundry_category"]
          created_at?: string
          id?: string
          item_count?: number | null
          laundry_date?: string
          midtrans_order_id?: string | null
          midtrans_snap_token?: string | null
          notes?: string | null
          paid_at?: string | null
          admin_fee?: number
          payment_method?: string | null
          partner_id: string
          price_per_unit: number
          rejection_reason?: string | null
          staff_id: string
          status?: Database["public"]["Enums"]["order_status"]
          student_id: string
          total_price: number
          updated_at?: string
          vendor_share?: number
          weight_kg?: number | null
          yayasan_share?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category?: Database["public"]["Enums"]["laundry_category"]
          created_at?: string
          id?: string
          item_count?: number | null
          laundry_date?: string
          midtrans_order_id?: string | null
          midtrans_snap_token?: string | null
          notes?: string | null
          paid_at?: string | null
          admin_fee?: number
          payment_method?: string | null
          partner_id?: string
          price_per_unit?: number
          rejection_reason?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          student_id?: string
          total_price?: number
          updated_at?: string
          vendor_share?: number
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
      students: {
        Row: {
          class: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          nis: string | null
          parent_id: string
          updated_at: string
        }
        Insert: {
          class: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          nis?: string | null
          parent_id: string
          updated_at?: string
        }
        Update: {
          class?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          nis?: string | null
          parent_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
    },
  },
} as const
