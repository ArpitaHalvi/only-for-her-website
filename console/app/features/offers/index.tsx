// app/features/offers/index.tsx
"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { DataTable } from "@/components/crud";
import { type ColumnDef } from "@tanstack/react-table";
import { CirclePlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useGetOffersQuery,
  useDeleteOfferMutation,
  useUpdateOfferMutation,
  type Offer,
} from "./data/offerApi";

const date = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

// Whether the banner is on the website right now
const liveState = (o: Offer) => {
  const now = Date.now();
  if (!o.isActive) return { label: "Off", variant: "outline" as const };
  if (o.startsAt && new Date(o.startsAt).getTime() > now) return { label: "Scheduled", variant: "secondary" as const };
  if (o.endsAt && new Date(o.endsAt).getTime() < now) return { label: "Expired", variant: "outline" as const };
  return { label: "Live", variant: "default" as const };
};

export default function OffersPage() {
  const navigate = useNavigate();
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  const { data, isLoading } = useGetOffersQuery({ page, limit });
  const [deleteOffer] = useDeleteOfferMutation();
  const [updateOffer] = useUpdateOfferMutation();

  const handleDelete = async (item: Offer) => {
    await toast.promise(deleteOffer(item._id).unwrap(), {
      loading: `Deleting ${item.title}...`,
      success: (res: any) => res?.message || `Offer ${item.title} deleted.`,
      error: "Failed to delete offer.",
    });
  };

  const toggle = async (o: Offer) => {
    const formData = new FormData();
    formData.append("isActive", String(!o.isActive));
    try {
      await updateOffer({ id: o._id, formData }).unwrap();
      toast.success(`${o.title} ${o.isActive ? "switched off" : "switched on"}.`);
    } catch {
      toast.error("Could not update the offer.");
    }
  };

  const columns: ColumnDef<Offer>[] = [
    {
      id: "image",
      header: "Banner",
      cell: ({ row }) => (
        <img src={row.original.image?.url} alt={row.original.title} className="h-14 w-32 rounded-md object-cover" />
      ),
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div>
          <p className="font-semibold">{row.original.title}</p>
          <p className="max-w-64 truncate text-xs text-muted-foreground">{row.original.link}</p>
        </div>
      ),
    },
    {
      id: "valid",
      header: "Schedule",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.startsAt || row.original.endsAt
            ? `${date(row.original.startsAt)} → ${date(row.original.endsAt)}`
            : "Always"}
        </span>
      ),
    },
    { accessorKey: "sortOrder", header: "Order" },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = liveState(row.original);
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: "isActive",
      header: "Active",
      cell: ({ row }) => <Switch checked={row.original.isActive} onCheckedChange={() => toggle(row.original)} />,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row, table }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(`/admin/offers/edit/${row.original._id}`)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => (table.options.meta as any)?.openDeleteDialog(row.original)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-3 p-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Offers</h1>
          <p className="text-sm text-muted-foreground">Banners shown under the hero on the website home page.</p>
        </div>
        <Button onClick={() => navigate("/admin/offers/create")}>
          <CirclePlus className="mr-2 h-4 w-4" /> Add Offer
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        searchKey="title"
        pagination={{
          page,
          totalPages: data?.pagination?.totalPages ?? 1,
          onPageChange: setPage,
          pageSize: limit,
          onPageSizeChange: setLimit,
        }}
        onDelete={handleDelete}
        deleteItemNameKey="title"
      />
    </div>
  );
}
