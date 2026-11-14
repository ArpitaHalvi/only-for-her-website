// app/features/products/data/productApi.ts

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getToken } from "~/utils/auth";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProductImage {
  url: string;
  publicId: string;
}

export interface ProductVariant {
  _id?: string;
  name: string;
  sku: string;
  /** Overrides the product price when set */
  price?: number | null;
  salePrice?: number | null;
  stock: number;
  /** Keyed by attribute slug, e.g. { size: "12mm" } */
  attributes?: Record<string, string>;
  inStock?: boolean;
}

export interface Product {
  _id: string;
  category: { _id: string; name: string; slug: string } | string;
  name: string;
  slug: string;
  sku: string;
  thumbnail: ProductImage | null;
  gallery: ProductImage[];
  price: number;
  salePrice: number | null;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  isCustom: boolean;
  isKids: boolean;
  shortDescription?: string;
  description?: string;
  variants: ProductVariant[];
  rating: number;
  reviewCount: number;
  metaTitle?: string;
  metaKeywords?: string;
  metaDescription?: string;
  /** Calculated by the API */
  inStock: boolean;
  discountPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedProductsResponse {
  success: boolean;
  data: Product[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SingleProductResponse {
  success: boolean;
  data: Product;
}

// ── API Slice ──────────────────────────────────────────────────────────────

export const productApi = createApi({
  reducerPath: "productApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${import.meta.env.VITE_API_URL}/`,
    prepareHeaders: (headers) => {
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ["Product"],

  endpoints: (builder) => ({
    // Admin list: includes inactive products, searches name / sku
    getProducts: builder.query<
      PaginatedProductsResponse,
      {
        page?: number;
        limit?: number;
        search?: string;
        category?: string;
        status?: "active" | "inactive" | "";
      }
    >({
      query: ({ page = 1, limit = 10, search = "", category = "", status = "" }) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          ...(search && { search }),
          ...(category && { category }),
          ...(status && { status }),
        });
        return `products/admin/list?${params.toString()}`;
      },
      providesTags: ["Product"],
    }),

    getProductById: builder.query<SingleProductResponse, string>({
      query: (id) => `products/${id}`,
      providesTags: ["Product"],
    }),

    // multipart/form-data: fields + `thumbnail` (1 file) + `gallery` (files)
    createProduct: builder.mutation<SingleProductResponse, FormData>({
      query: (formData) => ({ url: `products`, method: "POST", body: formData }),
      invalidatesTags: ["Product"],
    }),

    updateProduct: builder.mutation<
      SingleProductResponse,
      { id: string; formData: FormData }
    >({
      query: ({ id, formData }) => ({
        url: `products/${id}`,
        method: "PUT",
        body: formData,
      }),
      invalidatesTags: ["Product"],
    }),

    // Quick toggles from the table
    partiallyUpdateProduct: builder.mutation<
      SingleProductResponse,
      { id: string; data: Partial<Pick<Product, "isActive" | "isFeatured">> }
    >({
      query: ({ id, data }) => ({
        url: `products/${id}`,
        method: "PATCH",
        body: data,
      }),
      invalidatesTags: ["Product"],
    }),

    deleteProduct: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `products/${id}`, method: "DELETE" }),
      invalidatesTags: ["Product"],
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetProductByIdQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  usePartiallyUpdateProductMutation,
  useDeleteProductMutation,
} = productApi;
