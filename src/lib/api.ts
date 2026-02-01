// API Client for self-hosted backend
// Replaces Supabase client

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ApiError {
  error: string;
  message?: string;
  details?: unknown;
}

interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

// Helper function for API calls
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      credentials: "include", // Important for cookies/sessions
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: data as ApiError,
      };
    }

    return {
      data: data as T,
      error: null,
    };
  } catch (error) {
    console.error("API call error:", error);
    return {
      data: null,
      error: {
        error: "Network error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

// ============ AUTH API ============
export const authApi = {
  signIn: async (email: string, password: string) => {
    return apiCall<{ user: any; session: any }>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  signUp: async (
    email: string,
    password: string,
    name: string,
    phone?: string,
  ) => {
    return apiCall<{ user: any; session: any }>("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name, phone }),
    });
  },

  signOut: async () => {
    return apiCall<{ success: boolean }>("/api/auth/sign-out", {
      method: "POST",
    });
  },

  getSession: async () => {
    return apiCall<{ user: any; session: any } | null>(
      "/api/auth/get-session",
      {
        method: "GET",
      },
    );
  },
};

// ============ USERS API ============
export const usersApi = {
  getMe: async () => {
    return apiCall<{
      id: string;
      email: string;
      name: string;
      roles: string[];
      primaryRole: string | null;
      profile: any;
    }>("/api/users/me");
  },

  updateMe: async (data: { fullName?: string; phone?: string }) => {
    return apiCall<any>("/api/users/me", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  getUserRoles: async (userId: string) => {
    return apiCall<string[]>(`/api/users/${userId}/roles`);
  },

  addUserRole: async (userId: string, role: string) => {
    return apiCall<{ success: boolean }>(`/api/users/${userId}/roles`, {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  },

  removeUserRole: async (userId: string, role: string) => {
    return apiCall<{ success: boolean }>(`/api/users/${userId}/roles/${role}`, {
      method: "DELETE",
    });
  },
};

// ============ STUDENTS API ============
export const studentsApi = {
  list: async () => {
    return apiCall<any[]>("/api/students");
  },

  get: async (id: string) => {
    return apiCall<any>(`/api/students/${id}`);
  },

  create: async (data: {
    name: string;
    class: string;
    nik?: string;
    parentId?: string;
  }) => {
    return apiCall<any>("/api/students", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: { name?: string; class?: string; nik?: string; isActive?: boolean },
  ) => {
    return apiCall<any>(`/api/students/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return apiCall<{ success: boolean }>(`/api/students/${id}`, {
      method: "DELETE",
    });
  },
};

// ============ ORDERS API ============
export const ordersApi = {
  list: async (params?: {
    status?: string;
    studentId?: string;
    partnerId?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.studentId) searchParams.set("studentId", params.studentId);
    if (params?.partnerId) searchParams.set("partnerId", params.partnerId);

    const query = searchParams.toString();
    return apiCall<any[]>(`/api/orders${query ? `?${query}` : ""}`);
  },

  get: async (id: string) => {
    return apiCall<any>(`/api/orders/${id}`);
  },

  create: async (data: {
    studentId: string;
    partnerId: string;
    category: string;
    weightKg?: number;
    itemCount?: number;
    pricePerUnit: number;
    totalPrice: number;
    adminFee?: number;
    yayasanShare?: number;
    vendorShare?: number;
    notes?: string;
    laundryDate?: string;
  }) => {
    return apiCall<any>("/api/orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      status?: string;
      rejectionReason?: string;
      paymentMethod?: string;
      notes?: string;
    },
  ) => {
    return apiCall<any>(`/api/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  submit: async (id: string) => {
    return apiCall<any>(`/api/orders/${id}/submit`, {
      method: "POST",
    });
  },

  approve: async (id: string) => {
    return apiCall<any>(`/api/orders/${id}/approve`, {
      method: "POST",
    });
  },

  reject: async (id: string, reason?: string) => {
    return apiCall<any>(`/api/orders/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  confirmPayment: async (id: string, paymentMethod?: string) => {
    return apiCall<any>(`/api/orders/${id}/confirm-payment`, {
      method: "POST",
      body: JSON.stringify({ paymentMethod }),
    });
  },

  complete: async (id: string) => {
    return apiCall<any>(`/api/orders/${id}/complete`, {
      method: "POST",
    });
  },

  delete: async (id: string) => {
    return apiCall<{ success: boolean }>(`/api/orders/${id}`, {
      method: "DELETE",
    });
  },
};

// ============ PARTNERS API ============
export const partnersApi = {
  list: async (activeOnly?: boolean) => {
    const query = activeOnly ? "?activeOnly=true" : "";
    return apiCall<any[]>(`/api/partners${query}`);
  },

  get: async (id: string) => {
    return apiCall<any>(`/api/partners/${id}`);
  },

  create: async (data: {
    name: string;
    phone?: string;
    address?: string;
    userId?: string;
  }) => {
    return apiCall<any>("/api/partners", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update: async (
    id: string,
    data: {
      name?: string;
      phone?: string;
      address?: string;
      isActive?: boolean;
    },
  ) => {
    return apiCall<any>(`/api/partners/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return apiCall<{ success: boolean }>(`/api/partners/${id}`, {
      method: "DELETE",
    });
  },
};

// ============ PRICES API ============
export const pricesApi = {
  list: async () => {
    return apiCall<any[]>("/api/prices");
  },

  get: async (category: string) => {
    return apiCall<any>(`/api/prices/${category}`);
  },

  update: async (
    category: string,
    data: { pricePerUnit: number; unitName?: string },
  ) => {
    return apiCall<any>(`/api/prices/${category}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
};

// ============ SETTINGS API ============
export const settingsApi = {
  getHoliday: async () => {
    return apiCall<{ isHoliday: boolean }>("/api/settings/holiday");
  },

  updateHoliday: async (isHoliday: boolean) => {
    return apiCall<any>("/api/settings/holiday", {
      method: "PUT",
      body: JSON.stringify({ isHoliday }),
    });
  },
};

// ============ MIDTRANS API ============
export const midtransApi = {
  createToken: async (data: {
    orderId: string;
    grossAmount: number;
    customerDetails: {
      firstName: string;
      lastName?: string;
      email: string;
      phone?: string;
    };
    itemDetails: Array<{
      id: string;
      price: number;
      quantity: number;
      name: string;
    }>;
  }) => {
    return apiCall<{
      token: string;
      redirect_url: string;
      midtrans_order_id: string;
    }>("/api/midtrans/token", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// Export all APIs
export const api = {
  auth: authApi,
  users: usersApi,
  students: studentsApi,
  orders: ordersApi,
  partners: partnersApi,
  prices: pricesApi,
  settings: settingsApi,
  midtrans: midtransApi,
};

export default api;
