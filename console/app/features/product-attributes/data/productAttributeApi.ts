// app/features/product-attributes/data/productAttributeApi.ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getToken } from "~/utils/auth";

export interface ProductAttribute {
  _id: string;
  name: string;
  slug: string;
  values: string[];
  createdAt: string;
  updatedAt: string;
}

export const productAttributeApi = createApi({
  reducerPath: "productAttributeApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${import.meta.env.VITE_API_URL}/`,
    prepareHeaders: (headers) => {
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ["ProductAttribute"],

  endpoints: (builder) => ({
    getProductAttributes: builder.query<
      { success: boolean; data: ProductAttribute[]; totalCount: number },
      void
    >({
      query: () => "product-attributes",
      providesTags: ["ProductAttribute"],
    }),

    getProductAttributeById: builder.query<
      { success: boolean; data: ProductAttribute },
      string
    >({
      query: (id) => `product-attributes/${id}`,
      providesTags: ["ProductAttribute"],
    }),

    createProductAttribute: builder.mutation<
      { success: boolean; data: ProductAttribute },
      { name: string; values: string[] }
    >({
      query: (body) => ({ url: "product-attributes", method: "POST", body }),
      invalidatesTags: ["ProductAttribute"],
    }),

    updateProductAttribute: builder.mutation<
      { success: boolean; data: ProductAttribute },
      { id: string; data: { name: string; values: string[] } }
    >({
      query: ({ id, data }) => ({
        url: `product-attributes/${id}`,
        method: "PUT",
        body: data,
      }),
      invalidatesTags: ["ProductAttribute"],
    }),

    deleteProductAttribute: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `product-attributes/${id}`, method: "DELETE" }),
      invalidatesTags: ["ProductAttribute"],
    }),
  }),
});

export const {
  useGetProductAttributesQuery,
  useGetProductAttributeByIdQuery,
  useCreateProductAttributeMutation,
  useUpdateProductAttributeMutation,
  useDeleteProductAttributeMutation,
} = productAttributeApi;
