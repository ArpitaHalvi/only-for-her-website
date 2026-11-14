// app/features/orders/detail.tsx
// One order: what was bought, who pays what, payment records, status history,
// and the controls to move the order along.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Loader2,
  Package,
  MapPin,
  CreditCard,
  User,
  Save,
  History,
  AlertTriangle,
  Undo2,
  Truck,
  RefreshCw,
  ExternalLink,
  FileText,
  Download,
} from "lucide-react";
import { getToken } from "~/utils/auth";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  useAddTrackingUpdateMutation,
  useCreateCreditNoteMutation,
  useGetOrderByIdQuery,
  useRefreshTrackingMutation,
  useRefundOrderMutation,
  useUpdateOrderStatusMutation,
  useUpdatePaymentStatusMutation,
  type ShipmentStatus,
} from "./data/orderApi";

const SHIPMENT_STEPS: { value: ShipmentStatus; text: string }[] = [
  { value: "picked_up", text: "Picked up by courier" },
  { value: "in_transit", text: "In transit" },
  { value: "out_for_delivery", text: "Out for delivery" },
  { value: "delivered", text: "Delivered" },
  { value: "delivery_failed", text: "Delivery attempt failed" },
  { value: "returned_to_origin", text: "Returning to us" },
];

// A PDF needs the admin token, so it is fetched and saved from here rather than opened as a link
async function downloadPdf(path: string, fallbackName: string) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/orders/${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || "Could not download the document.");
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// <input type="date"> wants yyyy-mm-dd
const dateInput = (d?: string) => (d ? new Date(d).toISOString().slice(0, 10) : "");

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-sky-100 text-sky-700",
  processing: "bg-warning-soft text-warning",
  shipped: "bg-info-soft text-info",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
  returned: "bg-purple-100 text-purple-700",
  failed: "bg-red-100 text-red-600",
};

const PAYMENT_COLORS: Record<string, string> = {
  unpaid: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
  partially_refunded: "bg-purple-100 text-purple-700",
  refunded: "bg-purple-100 text-purple-700",
};

const money = (n?: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const when = (d?: string) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const label = (s: string) => s.replace(/_/g, " ");

const Pill = ({ text, colors }: { text: string; colors: Record<string, string> }) => (
  <span
    className={`inline-block rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase ${colors[text] || "bg-gray-100"}`}
  >
    {label(text)}
  </span>
);

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="text-muted-foreground">{k}</span>
    <span className="text-right font-medium">{children}</span>
  </div>
);

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useGetOrderByIdQuery(id ?? "", { skip: !id });
  const [updateStatus, { isLoading: isSaving }] = useUpdateOrderStatusMutation();
  const [updatePayment, { isLoading: isPaying }] = useUpdatePaymentStatusMutation();
  const [refund, { isLoading: isRefunding }] = useRefundOrderMutation();
  const [addTracking, { isLoading: isAddingTracking }] = useAddTrackingUpdateMutation();
  const [refreshTracking, { isLoading: isRefreshing }] = useRefreshTrackingMutation();
  const [createCreditNote, { isLoading: isCrediting }] = useCreateCreditNoteMutation();
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  const order = data?.data;

  const [nextStatus, setNextStatus] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [courierName, setCourierName] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [updateStatus2, setUpdateStatus2] = useState<ShipmentStatus>("in_transit");
  const [updateLocation, setUpdateLocation] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  // Fill the form when the order loads or changes
  useEffect(() => {
    if (!order) return;
    setNextStatus("");
    setTrackingNumber(order.trackingNumber ?? "");
    setCourierName(order.courierName ?? "");
    setTrackingUrl(order.trackingUrl ?? "");
    setEstimatedDelivery(dateInput(order.estimatedDelivery));
    setAdminNote(order.adminNote ?? "");
  }, [order]);

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const customer = typeof order.customer === "object" ? order.customer : null;
  const addr = order.shippingAddress;
  const allowed = order.allowedStatuses ?? [];
  const closing = nextStatus === "cancelled" || nextStatus === "failed";
  const waitingForPayment = order.paymentMethod === "razorpay" && order.paymentStatus === "unpaid";
  const canRefund =
    order.paymentMethod === "razorpay" &&
    (order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded");

  const canReceipt =
    order.paymentMethod === "razorpay" &&
    order.paymentStatus === "paid" &&
    ["confirmed", "processing"].includes(order.status);

  const run = async (action: Promise<unknown>, ok: string) => {
    try {
      await action;
      toast.success(ok);
    } catch (err: any) {
      toast.error(err?.data?.message || err?.message || "That did not work.");
    }
  };

  const save = () =>
    run(
      updateStatus({
        id: order._id,
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(closing ? { cancelReason } : {}),
        trackingNumber,
        courierName,
        trackingUrl,
        estimatedDelivery,
        adminNote,
      }).unwrap(),
      nextStatus ? `Order is now ${nextStatus}.` : "Order updated.",
    );

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/orders")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Orders
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{order.orderNo}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Placed on {when(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Pill text={order.status} colors={STATUS_COLORS} />
          <Pill text={order.paymentStatus} colors={PAYMENT_COLORS} />
        </div>
      </div>

      {order.refundRequired && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This order was closed after the customer paid. <strong>Issue a refund</strong> from the
            panel on the right.
          </p>
        </div>
      )}
      {waitingForPayment && order.status === "pending" && order.paymentExpiresAt && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          Waiting for the online payment. It is cancelled automatically at {when(order.paymentExpiresAt)}{" "}
          if it is not paid.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left ─────────────────────────────────────────────────── */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" /> Items ({order.items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {item.image && (
                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.name}
                        {item.variantName && <span className="text-muted-foreground"> · {item.variantName}</span>}
                      </p>
                      {item.sku && <p className="text-xs text-muted-foreground">SKU {item.sku}</p>}
                      <p className="text-xs text-muted-foreground">
                        Qty {item.quantity} × {money(item.price)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">
                      {money(item.lineTotal ?? item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-1.5 border-t pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{money(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
                    <span>−{money(order.discount)}</span>
                  </div>
                )}
                {order.taxRate > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      Tax {order.taxRate}% ({order.taxMode === "inclusive" ? "included in price" : "added"})
                    </span>
                    <span>{money(order.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping</span>
                  {order.shippingCharge === 0 ? (
                    <span className="font-medium text-green-600">FREE</span>
                  ) : (
                    <span>{money(order.shippingCharge)}</span>
                  )}
                </div>
                {(order.codCharge ?? 0) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Cash on delivery fee</span>
                    <span>{money(order.codCharge)}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold">
                  <span>Total</span>
                  <span>{money(order.totalAmount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4" /> Ship to
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-semibold">{addr?.fullName}</p>
                <p className="text-muted-foreground">{addr?.phone}</p>
                <p className="text-muted-foreground">
                  {addr?.line1}
                  {addr?.line2 ? `, ${addr.line2}` : ""}
                  {addr?.landmark ? ` (near ${addr.landmark})` : ""}
                </p>
                <p className="text-muted-foreground">
                  {addr?.city}, {addr?.state} – {addr?.pincode}
                  {addr?.country && addr.country !== "India" ? `, ${addr.country}` : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4" /> Customer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-semibold">{customer?.name || order.customerName || "—"}</p>
                <p className="text-muted-foreground">{customer?.email || order.customerEmail}</p>
                <p className="text-muted-foreground">{customer?.phone || order.customerPhone || "—"}</p>
                {order.customerNote && (
                  <p className="mt-2 rounded-lg bg-muted p-2 text-xs">
                    <span className="font-semibold">Note:</span> {order.customerNote}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Payment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" /> Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row k="Method">{order.paymentMethod === "cod" ? "Cash on delivery" : "Online (Razorpay)"}</Row>
              <Row k="Status">{label(order.paymentStatus)}</Row>
              {order.paymentMethod === "cod" && order.paymentStatus === "unpaid" && !["cancelled", "failed", "returned"].includes(order.status) && (
                <Row k="Collect on delivery">{money(order.totalAmount)}</Row>
              )}
              {order.paidAt && <Row k="Paid at">{when(order.paidAt)}</Row>}
              {order.razorpayOrderId && <Row k="Gateway order"><span className="font-mono text-xs">{order.razorpayOrderId}</span></Row>}
              {order.paymentId && <Row k="Payment ID"><span className="font-mono text-xs">{order.paymentId}</span></Row>}

              {(order.transactions?.length ?? 0) > 0 && (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Payment records
                  </p>
                  <ul className="space-y-2">
                    {order.transactions!.map((t) => (
                      <li key={t._id} className="rounded-lg bg-muted/50 p-3 text-xs">
                        <div className="flex justify-between font-medium">
                          <span className="uppercase">{label(t.status)}</span>
                          <span>{money(t.amount)}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {when(t.paidAt || t.createdAt)}
                          {t.razorpayPaymentId ? ` · ${t.razorpayPaymentId}` : ""}
                        </p>
                        {t.amountRefunded > 0 && (
                          <p className="mt-1 text-purple-700">Refunded {money(t.amountRefunded)}</p>
                        )}
                        {t.failureReason && <p className="mt-1 text-red-600">{t.failureReason}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipping */}
          {(order.trackingNumber || (order.trackingEvents?.length ?? 0) > 0 || ["shipped", "delivered", "returned"].includes(order.status)) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="h-4 w-4" /> Shipping
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <Row k="Courier">{order.courierName || "—"}</Row>
                  <Row k="Tracking number">
                    {order.trackingNumber ? <span className="font-mono text-xs">{order.trackingNumber}</span> : "—"}
                  </Row>
                  {order.trackingUrl && (
                    <Row k="Tracking link">
                      <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    </Row>
                  )}
                  {order.estimatedDelivery && (
                    <Row k="Expected delivery">
                      {new Date(order.estimatedDelivery).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </Row>
                  )}
                  {order.shipmentStatus && <Row k="Parcel status">{label(order.shipmentStatus)}</Row>}
                </div>

                {(order.trackingEvents?.length ?? 0) > 0 && (
                  <ol className="space-y-3 border-l pl-4">
                    {[...order.trackingEvents!].reverse().map((e, i) => (
                      <li key={i} className="relative">
                        <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-primary" />
                        <p className="font-medium capitalize">
                          {label(e.status)} <span className="font-normal text-muted-foreground">· {e.source ?? "admin"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {when(e.at)}
                          {e.location ? ` · ${e.location}` : ""}
                          {e.description ? ` · ${e.description}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}

                {["confirmed", "processing", "shipped"].includes(order.status) && (
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Add a tracking update</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Select value={updateStatus2} onValueChange={(v) => setUpdateStatus2(v as ShipmentStatus)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SHIPMENT_STEPS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.text}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input placeholder="Location (optional)" value={updateLocation} onChange={(e) => setUpdateLocation(e.target.value)} />
                    </div>
                    <Input placeholder="Note shown to the customer (optional)" value={updateNote} onChange={(e) => setUpdateNote(e.target.value)} />
                    {updateStatus2 === "delivered" && (
                      <p className="text-xs text-muted-foreground">
                        This completes the order{order.paymentMethod === "cod" ? " and records the cash as collected" : ""}.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={isAddingTracking}
                        onClick={() =>
                          run(
                            addTracking({
                              id: order._id,
                              status: updateStatus2,
                              location: updateLocation || undefined,
                              description: updateNote || undefined,
                            })
                              .unwrap()
                              .then(() => {
                                setUpdateLocation("");
                                setUpdateNote("");
                              }),
                            "Tracking updated.",
                          )
                        }
                      >
                        {isAddingTracking ? "Adding…" : "Add update"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isRefreshing || !order.trackingNumber}
                        onClick={() => run(refreshTracking(order._id).unwrap(), "Tracking refreshed.")}
                      >
                        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                        Refresh from courier
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Updates are typed in by hand until a courier service is connected. Refresh from courier starts working then.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 border-l pl-4 text-sm">
                {(order.statusHistory ?? []).map((h, i) => (
                  <li key={i} className="relative">
                    <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="font-medium capitalize">
                      {h.status} <span className="font-normal text-muted-foreground">· by {h.by}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {when(h.at)}
                      {h.note ? ` · ${h.note}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: controls ──────────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Update order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Move to</Label>
                {allowed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This order is {order.status}. No further steps.
                  </p>
                ) : (
                  <Select value={nextStatus} onValueChange={setNextStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Currently ${order.status}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {allowed.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {waitingForPayment && allowed.includes("confirmed") && (
                  <p className="text-xs text-muted-foreground">
                    An online order can only move on after it is paid.
                  </p>
                )}
              </div>

              {closing && (
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is it being closed?" />
                  <p className="text-xs text-muted-foreground">The items go back into stock.</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Tracking number</Label>
                <Input placeholder="e.g. DTD123456789IN" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Courier</Label>
                <Input placeholder="e.g. Delhivery, BlueDart" value={courierName} onChange={(e) => setCourierName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tracking link</Label>
                <Input placeholder="Optional. Built from the default link if empty" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Expected delivery</Label>
                <Input type="date" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Internal note</Label>
                <Textarea rows={3} placeholder="Only visible to admins" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
              </div>

              <Button className="w-full" onClick={save} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </CardContent>
          </Card>

          {/* Cash on delivery: record the cash */}
          {order.paymentMethod === "cod" && !["cancelled", "failed", "returned"].includes(order.status) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Cash on delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Marked paid automatically when the order is delivered. Use this if the cash was
                  collected earlier.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isPaying}
                  onClick={() =>
                    run(
                      updatePayment({
                        id: order._id,
                        paymentStatus: order.paymentStatus === "paid" ? "unpaid" : "paid",
                      }).unwrap(),
                      "Payment status updated.",
                    )
                  }
                >
                  {order.paymentStatus === "paid" ? "Mark as unpaid" : "Mark as paid"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Invoice, receipt and credit notes */}
          {(order.invoice?.number || ["shipped", "delivered", "returned"].includes(order.status) || canReceipt) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" /> Invoice
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {order.invoice?.number ? (
                  <>
                    <Row k="Number">{order.invoice.number}</Row>
                    <Row k="Issued">{when(order.invoice.date)}</Row>
                    <Row k="Type">{order.invoice.kind === "tax_invoice" ? "Tax invoice" : "Bill of supply"}</Row>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {canReceipt
                      ? "The tax invoice is created when this order ships. Until then the customer can download a payment receipt."
                      : "The invoice is created when the order ships."}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {["shipped", "delivered", "returned"].includes(order.status) && (
                    <Button size="sm" variant="outline" onClick={() => run(downloadPdf(`${order._id}/invoice`, "invoice.pdf"), "Invoice downloaded.")}>
                      <Download className="mr-2 h-3.5 w-3.5" /> Download invoice
                    </Button>
                  )}
                  {canReceipt && (
                    <Button size="sm" variant="outline" onClick={() => run(downloadPdf(`${order._id}/receipt`, "receipt.pdf"), "Receipt downloaded.")}>
                      <Download className="mr-2 h-3.5 w-3.5" /> Payment receipt
                    </Button>
                  )}
                </div>

                {(order.creditNotes?.length ?? 0) > 0 && (
                  <div className="border-t pt-3">
                    <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Credit notes</p>
                    <ul className="space-y-2">
                      {order.creditNotes!.map((n) => (
                        <li key={n.number} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-2 text-xs">
                          <span>
                            <span className="font-medium">{n.number}</span> · {money(n.amount)}
                            {n.reason ? ` · ${n.reason}` : ""}
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => run(downloadPdf(`${order._id}/credit-notes/${encodeURIComponent(n.number)}`, "credit-note.pdf"), "Credit note downloaded.")}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {order.invoice?.number && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      Online refunds create a credit note by themselves. For money returned another way (cash,
                      bank transfer), create one here.
                    </p>
                    <div className="flex gap-2">
                      <Input type="number" min="1" placeholder="Amount (₹)" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
                      <Input placeholder="Reason" value={creditReason} onChange={(e) => setCreditReason(e.target.value)} />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isCrediting || !creditAmount}
                      onClick={() =>
                        run(
                          createCreditNote({ id: order._id, amount: Number(creditAmount), reason: creditReason || undefined })
                            .unwrap()
                            .then(() => {
                              setCreditAmount("");
                              setCreditReason("");
                            }),
                          "Credit note created.",
                        )
                      }
                    >
                      {isCrediting ? "Creating…" : "Create credit note"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Online payment: refund */}
          {canRefund && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Undo2 className="h-4 w-4" /> Refund
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Amount (₹)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Leave empty to refund everything left"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={isRefunding}
                  onClick={() => {
                    if (!window.confirm(`Refund ${refundAmount ? money(Number(refundAmount)) : "the full remaining amount"} to the customer?`)) return;
                    run(
                      refund({
                        id: order._id,
                        ...(refundAmount ? { amount: Number(refundAmount) } : {}),
                        reason: refundReason || undefined,
                      })
                        .unwrap()
                        .then(() => {
                          setRefundAmount("");
                          setRefundReason("");
                        }),
                      "Refund issued.",
                    );
                  }}
                >
                  {isRefunding ? "Refunding…" : "Issue refund"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
