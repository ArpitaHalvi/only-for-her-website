// app/features/orders/data/orderApi.ts

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getToken } from "~/utils/auth";

// ── Types ──────────────────────────────────────────────────────────────────

export interface OrderItem {
  product?: string;
  variantId?: string | null;
  name: string;
  variantName?: string;
  sku?: string;
  image?: string;
  attributes?: Record<string, string>;
  price: number;
  quantity: number;
  lineTotal?: number;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  country?: string;
  pincode: string;
}

export interface CustomerSnippet {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "failed";

export type PaymentStatus = "unpaid" | "paid" | "partially_refunded" | "refunded";

export interface StatusHistoryEntry {
  status: OrderStatus;
  at: string;
  by: "customer" | "admin" | "system";
  note?: string;
}

export interface PaymentTransaction {
  _id: string;
  provider: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  status: string;
  amount: number;
  tax: number;
  fee: number;
  amountRefunded: number;
  failureReason?: string;
  paidAt?: string;
  refundedAt?: string;
  createdAt: string;
}

export type ShipmentStatus =
  | "label_created"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "delivery_failed"
  | "returned_to_origin";

export interface TrackingEvent {
  status: ShipmentStatus;
  description?: string;
  location?: string;
  at: string;
  source?: "admin" | "courier" | "system";
}

export interface CreditNoteInfo {
  number: string;
  date: string;
  amount: number;
  taxAmount?: number;
  reason?: string;
}

export interface Order {
  _id: string;
  orderNo: string;
  customer: CustomerSnippet | string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shippingCharge: number;
  codCharge?: number;
  tax: number;
  taxMode: "inclusive" | "exclusive";
  taxRate: number;
  totalAmount: number;
  couponCode?: string;
  shippingAddress: ShippingAddress;
  paymentMethod: "razorpay" | "cod";
  paymentStatus: PaymentStatus;
  razorpayOrderId?: string;
  paymentId?: string;
  paidAt?: string;
  refundRequired?: boolean;
  paymentExpiresAt?: string;
  status: OrderStatus;
  statusHistory?: StatusHistoryEntry[];
  trackingNumber?: string;
  courierName?: string;
  invoice?: { number?: string; date?: string; kind?: "tax_invoice" | "bill_of_supply" };
  creditNotes?: CreditNoteInfo[];
  trackingUrl?: string;
  estimatedDelivery?: string;
  shipmentProvider?: string;
  shipmentStatus?: ShipmentStatus;
  trackingEvents?: TrackingEvent[];
  shippedAt?: string;
  deliveredAt?: string;
  adminNote?: string;
  customerNote?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  /** Only on the single-order response */
  transactions?: PaymentTransaction[];
  allowedStatuses?: OrderStatus[];
}

export interface PaginatedOrdersResponse {
  success: boolean;
  data: Order[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SingleOrderResponse {
  success: boolean;
  data: Order;
}

export interface OrderStatsResponse {
  success: boolean;
  data: {
    totalOrders: number;
    totalRevenue: number;
    refundsDue?: number;
    byStatus: Record<string, number>;
    byPayment: Record<string, number>;
  };
}

export interface UpdateOrderStatusPayload {
  id: string;
  status?: string;
  paymentStatus?: string;
  trackingNumber?: string;
  courierName?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  adminNote?: string;
  cancelReason?: string;
  note?: string;
}

// ── API Slice ──────────────────────────────────────────────────────────────

export const orderApi = createApi({
  reducerPath: "orderApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${import.meta.env.VITE_API_URL}/admin/orders`,
    prepareHeaders: (headers) => {
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ["Order"],

  endpoints: (builder) => ({
    getOrderStats: builder.query<OrderStatsResponse, void>({
      query: () => "/stats",
      providesTags: ["Order"],
    }),

    getOrders: builder.query<
      PaginatedOrdersResponse,
      {
        page?: number;
        limit?: number;
        status?: string;
        paymentStatus?: string;
        paymentMethod?: string;
        refundRequired?: boolean;
        search?: string;
      }
    >({
      query: ({ page = 1, limit = 20, status = "", paymentStatus = "", paymentMethod = "", refundRequired = false, search = "" }) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          ...(status && { status }),
          ...(paymentStatus && { paymentStatus }),
          ...(paymentMethod && { paymentMethod }),
          ...(refundRequired && { refundRequired: "true" }),
          ...(search && { search }),
        });
        return `/?${params.toString()}`;
      },
      providesTags: ["Order"],
    }),

    getOrderById: builder.query<SingleOrderResponse, string>({
      query: (id) => `/${id}`,
      providesTags: ["Order"],
    }),

    updateOrderStatus: builder.mutation<SingleOrderResponse, UpdateOrderStatusPayload>({
      query: ({ id, ...body }) => ({
        url: `/${id}/status`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Order"],
    }),

    updatePaymentStatus: builder.mutation<SingleOrderResponse, { id: string; paymentStatus: PaymentStatus }>({
      query: ({ id, paymentStatus }) => ({
        url: `/${id}/payment`,
        method: "PATCH",
        body: { paymentStatus },
      }),
      invalidatesTags: ["Order"],
    }),

    addTrackingUpdate: builder.mutation<
      SingleOrderResponse,
      { id: string; status: ShipmentStatus; description?: string; location?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/${id}/tracking`, method: "POST", body }),
      invalidatesTags: ["Order"],
    }),

    refreshTracking: builder.mutation<SingleOrderResponse, string>({
      query: (id) => ({ url: `/${id}/tracking/refresh`, method: "POST" }),
      invalidatesTags: ["Order"],
    }),

    createCreditNote: builder.mutation<unknown, { id: string; amount: number; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/${id}/credit-note`, method: "POST", body }),
      invalidatesTags: ["Order"],
    }),

    refundOrder: builder.mutation<SingleOrderResponse, { id: string; amount?: number; reason?: string }>({
      query: ({ id, ...body }) => ({
        url: `/${id}/refund`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Order"],
    }),

    deleteOrder: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Order"],
    }),
  }),
});

export const {
  useGetOrderStatsQuery,
  useGetOrdersQuery,
  useGetOrderByIdQuery,
  useUpdateOrderStatusMutation,
  useUpdatePaymentStatusMutation,
  useAddTrackingUpdateMutation,
  useRefreshTrackingMutation,
  useCreateCreditNoteMutation,
  useRefundOrderMutation,
  useDeleteOrderMutation,
} = orderApi;
