// app/features/offers/data/offerApi.ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getToken } from "~/utils/auth";

export interface Offer {
  _id: string;
  title: string;
  image: { url: string; publicId: string };
  /** Where a click goes: a site path ("/shop") or a full https:// address */
  link: string;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export const offerApi = createApi({
  reducerPath: "offerApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${import.meta.env.VITE_API_URL}/offers`,
    prepareHeaders: (headers) => {
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ["Offer"],

  endpoints: (builder) => ({
    getOffers: builder.query<
      { success: boolean; data: Offer[]; pagination: { totalPages: number; total: number } },
      { page?: number; limit?: number }
    >({
      query: ({ page = 1, limit = 20 }) => `/?page=${page}&limit=${limit}`,
      providesTags: ["Offer"],
    }),

    getOfferById: builder.query<{ success: boolean; data: Offer }, string>({
      query: (id) => `/${id}`,
      providesTags: ["Offer"],
    }),

    // multipart/form-data: fields + `image`
    createOffer: builder.mutation<{ success: boolean; data: Offer }, FormData>({
      query: (body) => ({ url: "/", method: "POST", body }),
      invalidatesTags: ["Offer"],
    }),

    updateOffer: builder.mutation<{ success: boolean; data: Offer }, { id: string; formData: FormData }>({
      query: ({ id, formData }) => ({ url: `/${id}`, method: "PUT", body: formData }),
      invalidatesTags: ["Offer"],
    }),

    deleteOffer: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({ url: `/${id}`, method: "DELETE" }),
      invalidatesTags: ["Offer"],
    }),
  }),
});

export const {
  useGetOffersQuery,
  useGetOfferByIdQuery,
  useCreateOfferMutation,
  useUpdateOfferMutation,
  useDeleteOfferMutation,
} = offerApi;
