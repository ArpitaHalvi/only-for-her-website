// app/features/coupons/index.tsx
"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import {
  useGetCouponsQuery,
  useDeleteCouponMutation,
  useUpdateCouponMutation,
  type Coupon,
} from "./data/couponApi";
import { DataTable } from "@/components/crud";
import { type ColumnDef } from "@tanstack/react-table";
import { Switch } from "@/components/ui/switch";
import { CirclePlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const date = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function CouponsPage() {
  const navigate = useNavigate();
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  const { data, isLoading } = useGetCouponsQuery({ page, limit });
  const [deleteCoupon] = useDeleteCouponMutation();
  const [updateCoupon] = useUpdateCouponMutation();

  const handleDelete = async (item: Coupon) => {
    await toast.promise(deleteCoupon(item._id).unwrap(), {
      loading: `Deleting ${item.code}...`,
      success: (res: any) => res?.message || `Coupon ${item.code} deleted.`,
      error: "Failed to delete coupon.",
    });
  };

  const toggle = async (c: Coupon) => {
    try {
      await updateCoupon({ id: c._id, data: { isActive: !c.isActive } }).unwrap();
      toast.success(`${c.code} ${c.isActive ? "switched off" : "switched on"}.`);
    } catch {
      toast.error("Could not update the coupon.");
    }
  };

  const columns: ColumnDef<Coupon>[] = [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <div>
          <p className="font-mono font-semibold">{row.original.code}</p>
          {row.original.description && (
            <p className="text-xs text-muted-foreground">{row.original.description}</p>
          )}
        </div>
      ),
    },
    {
      id: "discount",
      header: "Discount",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <span className="text-sm">
            {c.type === "percent" ? `${c.value}%` : `₹${c.value}`}
            {c.type === "percent" && c.maxDiscount != null && (
              <span className="text-muted-foreground"> (up to ₹{c.maxDiscount})</span>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "minOrderAmount",
      header: "Min order",
      cell: ({ row }) => (row.original.minOrderAmount ? `₹${row.original.minOrderAmount}` : "—"),
    },
    {
      id: "valid",
      header: "Valid",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {date(row.original.startsAt)} → {date(row.original.expiresAt)}
        </span>
      ),
    },
    {
      id: "used",
      header: "Used",
      cell: ({ row }) => (
        <Badge variant="secondary" className="tabular-nums">
          {row.original.usedCount}
          {row.original.usageLimit != null ? ` / ${row.original.usageLimit}` : ""}
        </Badge>
      ),
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
            <DropdownMenuItem onClick={() => navigate(`/admin/coupons/edit/${row.original._id}`)}>
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
          <h1 className="text-2xl font-semibold">Coupons</h1>
          <p className="text-sm text-muted-foreground">Discount codes customers can enter at checkout.</p>
        </div>
        <Button onClick={() => navigate("/admin/coupons/create")}>
          <CirclePlus className="mr-2 h-4 w-4" /> Add Coupon
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        searchKey="code"
        pagination={{
          page,
          totalPages: data?.pagination?.totalPages ?? 1,
          onPageChange: setPage,
          pageSize: limit,
          onPageSizeChange: setLimit,
        }}
        onDelete={handleDelete}
        deleteItemNameKey="code"
      />
    </div>
  );
}
