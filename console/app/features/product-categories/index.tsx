// app/features/product-category/index.tsx
"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import {
  useGetProductCategoriesQuery,
  useDeleteProductCategoryMutation,
  usePartiallyUpdateProductCategoryMutation,
} from "./data/productCategoryApi";
import { DataTable, BulkActions } from "@/components/crud";
import { type ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Image as ImageIcon,
  ArrowUpDown,
  CirclePlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ProductCategoryPage() {
  const navigate = useNavigate();
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(10);
  const [tableInstance, setTableInstance] = React.useState<any>(null);

  const { data, isLoading } = useGetProductCategoriesQuery({ page, limit });
  const [deleteCategory] = useDeleteProductCategoryMutation();
  const [partiallyUpdateCategory] = usePartiallyUpdateProductCategoryMutation();

  const categoryData = data?.data ?? [];
  const totalPages = data?.pagination?.totalPages ?? 1;

  const handleDelete = async (item: any) => {
    await toast.promise(deleteCategory(item._id).unwrap(), {
      loading: `Deleting ${item.name}...`,
      success: `Product Category "${item.name}" deleted successfully!`,
      error: "Failed to delete product category.",
    });
  };

  const handleToggleActive = async (category: any) => {
    try {
      await partiallyUpdateCategory({
        id: category._id,
        data: { isActive: !category.isActive },
      }).unwrap();
      toast.success(
        `Category "${category.name}" has been ${category.isActive ? "deactivated" : "activated"}.`,
      );
    } catch {
      toast.error("Failed to update product category status.");
    }
  };

  const handleToggleFeatured = async (category: any) => {
    try {
      await partiallyUpdateCategory({
        id: category._id,
        data: { isFeatured: !category.isFeatured },
      }).unwrap();
      toast.success(
        `Category "${category.name}" has been ${category.isFeatured ? "unfeatured" : "featured"}.`,
      );
    } catch {
      toast.error("Failed to update featured status.");
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: "image",
      header: "Image",
      cell: ({ row }) => {
        const imageUrl = row.original.image?.url;
        return imageUrl ? (
          <img
            src={imageUrl}
            alt={row.original.name}
            className="h-10 w-10 rounded-full object-cover border"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center border">
            <ImageIcon className="h-4 w-4 opacity-50" />
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          {/* <p className="text-xs text-muted-foreground">/{row.original.slug}</p> */}
        </div>
      ),
    },
    {
      id: "parent",
      header: "Parent",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.parent?.name || "—"}
        </span>
      ),
    },
    {
      accessorKey: "sortOrder",
      header: "Order",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.original.sortOrder ?? 0}
        </span>
      ),
    },
    {
      accessorKey: "isFeatured",
      header: "Featured",
      cell: ({ row }) => (
        <Switch
          checked={!!row.original.isFeatured}
          onCheckedChange={() => handleToggleFeatured(row.original)}
        />
      ),
    },
    {
      accessorKey: "isActive",
      header: "Active",
      cell: ({ row }) => (
        <Switch
          checked={row.original.isActive}
          onCheckedChange={() => handleToggleActive(row.original)}
        />
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      cell: ({ row }) =>
        new Date(row.original.createdAt).toLocaleDateString("en-IN"),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row, table }) => {
        const category = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  navigate(`/admin/product-categories/edit/${category._id}`)
                }
              >
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  (table.options.meta as any)?.openDeleteDialog(category)
                }
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="p-0 space-y-3">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Product Categories</h1>
        <Button onClick={() => navigate("/admin/product-categories/create")}>
          <CirclePlus className="mr-2 h-4 w-4" /> Add Category
        </Button>
      </div>

      {tableInstance && (
        <BulkActions table={tableInstance} entityName="productCategory" />
      )}

      <DataTable
        columns={columns}
        data={categoryData}
        isLoading={isLoading}
        searchKey="name"
        pagination={{
          page,
          totalPages,
          onPageChange: setPage,
          pageSize: limit,
          onPageSizeChange: setLimit,
        }}
        onDelete={handleDelete}
        deleteItemNameKey="name"
        onTableReady={setTableInstance}
      />
    </div>
  );
}
