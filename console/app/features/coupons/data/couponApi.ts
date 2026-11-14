// app/features/coupons/data/couponApi.ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getToken } from "~/utils/auth";

export interface Coupon {
  _id: string;
  code: string;
  description?: string;
  type: "percent" | "fixed";
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
  createdAt: string;
}

export type CouponInput = Partial<Omit<Coupon, "_id" | "usedCount" | "createdAt">>;

export const couponApi = createApi({
  reducerPath: "couponApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${import.meta.env.VITE_API_URL}/coupons`,
    prepareHeaders: (headers) => {
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ["Coupon"],

  endpoints: (builder) => ({
    getCoupons: builder.query<
      { success: boolean; data: Coupon[]; pagination: { totalPages: number; total: number } },
      { page?: number; limit?: number; search?: string }
    >({
      query: ({ page = 1, limit = 20, search = "" }) => {
        const params = new URLSearchParams({ page: String(page), limit: String(limit), ...(search && { search }) });
        return `/?${params.toString()}`;
      },
      providesTags: ["Coupon"],
    }),

    getCouponById: builder.query<{ success: boolean; data: Coupon }, string>({
      query: (id) => `/${id}`,
      providesTags: ["Coupon"],
    }),

    createCoupon: builder.mutation<{ success: boolean; data: Coupon }, CouponInput>({
      query: (body) => ({ url: "/", method: "POST", body }),
      invalidatesTags: ["Coupon"],
    }),

    updateCoupon: builder.mutation<{ success: boolean; data: Coupon }, { id: string; data: CouponInput }>({
      query: ({ id, data }) => ({ url: `/${id}`, method: "PUT", body: data }),
      invalidatesTags: ["Coupon"],
    }),

    deleteCoupon: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({ url: `/${id}`, method: "DELETE" }),
      invalidatesTags: ["Coupon"],
    }),
  }),
});

export const {
  useGetCouponsQuery,
  useGetCouponByIdQuery,
  useCreateCouponMutation,
  useUpdateCouponMutation,
  useDeleteCouponMutation,
} = couponApi;
