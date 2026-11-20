export type Role =
  | "admin"
  | "courier"
  | "client"
  | "preparation"
  | "plant_admin"
  | "custom"
  | "client_member";
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "enroute"
  | "delivered"
  | "rejected"
  | "cancelled";
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  credit_limit: string;
  credit_used: string;
  google_sub?: string;
  permissions?: string[];
  clientId?: string;
  canViewPortfolio?: boolean;
}
export interface OrderInput {
  clientId?: string;
  branchId: string;
  start: string;
  end: string;
  credit: boolean;
  paymentMethod?: "cash" | "online" | "credit";
  recurrence?: {
    enabled: boolean;
    frequency: "days" | "weekly";
    intervalDays: number;
    weekdays: number[];
    endDay?: string;
  };
  notes?: string;
  items: { productId: string; quantity: number }[];
}
export interface PaymentInput {
  clientId: string;
  method: "cash" | "nequi" | "bancolombia";
  amount: number;
  allocations: { invoiceId: string; amount: number }[];
}
export interface AppConfig {
  googleClientId: string | null;
  devAuth: boolean;
  vapidPublicKey: string | null;
}
export interface TrackingState {
  active: boolean;
  location?: { lat: number; lng: number; updated_at: string };
  signalLost?: boolean;
  eta: null;
}
