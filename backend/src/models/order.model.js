import mongoose from "mongoose";
import { nextSequence } from "./counter.model.js";

export const ORDER_STATUSES = [
  "pending", // placed, waiting for payment (online) or for the shop to confirm (COD)
  "confirmed", // paid online, or confirmed by the shop
  "processing", // being packed
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "return_requested", // the customer asked to send something back
  "returned",
  "refunded", // returned and the money has been given back
  "failed", // online payment was never completed ("Payment Failed")
];

export const PAYMENT_STATUSES = ["unpaid", "paid", "partially_refunded", "refunded"];

// Snapshot of what was bought, so the order stays correct if the product changes later.
const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
    variantName: { type: String },
    sku: { type: String },
    image: { type: String },
    attributes: { type: Map, of: String },
    price: { type: Number, required: true, min: 0 }, // unit price paid
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    landmark: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    country: { type: String, default: "India", trim: true },
    pincode: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, enum: ["customer", "admin", "system"], default: "system" },
    note: { type: String },
  },
  { _id: false },
);

// Where the parcel is, as reported by the courier (or typed in by the shop).
export const SHIPMENT_STATUSES = [
  "label_created", // shipment booked, not picked up yet
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "delivery_failed", // attempted, will be tried again
  "returned_to_origin", // coming back to us
];

const trackingEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: SHIPMENT_STATUSES, required: true },
    description: { type: String, trim: true },
    location: { type: String, trim: true },
    at: { type: Date, default: Date.now },
    source: { type: String, enum: ["admin", "courier", "system"], default: "admin" },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    // Human friendly number, e.g. OFH-001042 (assigned on creation)
    orderNo: { type: String, unique: true, index: true },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    // Copied so the order stays readable even if the customer is deleted
    customerName: { type: String },
    customerEmail: { type: String },
    customerPhone: { type: String },

    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },

    // ── Pricing ───────────────────────────────────────────────────────────
    subtotal: { type: Number, required: true, min: 0 }, // items, before discount
    discount: { type: Number, default: 0, min: 0 },
    shippingCharge: { type: Number, default: 0, min: 0 },
    codCharge: { type: Number, default: 0, min: 0 }, // extra fee for cash on delivery
    giftWrapCharge: { type: Number, default: 0, min: 0 }, // chosen gift wrap
    tax: { type: Number, default: 0, min: 0 }, // the GST amount (included in or added to the total)
    taxMode: { type: String, enum: ["inclusive", "exclusive"], default: "inclusive" },
    taxRate: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 }, // what the customer pays
    couponCode: { type: String, uppercase: true, trim: true },

    shippingAddress: { type: shippingAddressSchema, required: true },

    // ── Payment ───────────────────────────────────────────────────────────
    paymentMethod: { type: String, enum: ["razorpay", "cod"], required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "unpaid", index: true },
    razorpayOrderId: { type: String, index: true, sparse: true },
    paymentId: { type: String }, // gateway payment id once paid
    paidAt: { type: Date },
    // Set when an already-paid order was cancelled and money must go back
    refundRequired: { type: Boolean, default: false },
    // Unpaid online orders are cancelled and their stock released after this time
    paymentExpiresAt: { type: Date },

    // ── Fulfilment ────────────────────────────────────────────────────────
    status: { type: String, enum: ORDER_STATUSES, default: "pending", index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    trackingNumber: { type: String, trim: true },
    courierName: { type: String, trim: true },
    trackingUrl: { type: String, trim: true }, // where the customer can follow the parcel
    estimatedDelivery: { type: Date },
    // Which integration created the shipment ("manual" = entered by hand) and its own id
    shipmentProvider: { type: String, default: "manual" },
    shipmentId: { type: String },
    shipmentStatus: { type: String, enum: SHIPMENT_STATUSES },
    trackingEvents: { type: [trackingEventSchema], default: [] },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String },

    // True while this order's items are taken out of stock. Makes releasing
    // the stock safe to repeat.
    stockReserved: { type: Boolean, default: true },

    // Sent by the storefront with each checkout attempt, so a double click or a
    // retried request can never place the same order twice.
    idempotencyKey: { type: String },

    // Set once the order-confirmation email has gone out (so it is never sent twice)
    confirmationEmailSentAt: { type: Date, default: null },

    customerNote: { type: String, maxlength: 500 },
    // Gift: the shop packs it as a gift and leaves prices off the packing slip
    gift: {
      isGift: { type: Boolean, default: false },
      message: { type: String, trim: true, maxlength: 250 },
      wrap: { type: Boolean, default: false }, // gift wrapping requested
      wrapName: { type: String, trim: true, maxlength: 60 }, // which wrap was chosen
      recipientName: { type: String, trim: true, maxlength: 100 }, // printed on the card
      fromName: { type: String, trim: true, maxlength: 100 },
      hidePrice: { type: Boolean, default: true },
    },
    adminNote: { type: String },

    // ── Invoice (issued when the order ships) ─────────────────────────────
    // `snapshot` holds everything printed on the document (seller details, GST split,
    // lines), so a later download is always identical to the first one.
    invoice: {
      number: { type: String },
      date: { type: Date },
      financialYear: { type: String },
      kind: { type: String, enum: ["tax_invoice", "bill_of_supply"] }, // not "type": that word is reserved by Mongoose
      snapshot: { type: mongoose.Schema.Types.Mixed },
    },
    // One per refund after the invoice was issued
    creditNotes: {
      type: [
        new mongoose.Schema(
          {
            number: { type: String, required: true },
            date: { type: Date, default: Date.now },
            amount: { type: Number, required: true, min: 0 },
            taxAmount: { type: Number, default: 0, min: 0 },
            reason: { type: String },
            refundId: { type: String },
            snapshot: { type: mongoose.Schema.Types.Mixed },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ "invoice.number": 1 }, { unique: true, partialFilterExpression: { "invoice.number": { $type: "string" } } });
orderSchema.index(
  { customer: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

orderSchema.pre("validate", async function (next) {
  try {
    if (this.isNew && !this.orderNo) {
      const seq = await nextSequence("order");
      this.orderNo = `OFH-${String(1000 + seq).padStart(6, "0")}`;
    }
    if (this.isNew && this.statusHistory.length === 0) {
      this.statusHistory.push({ status: this.status, by: "system", note: "Order placed" });
    }
    // Once the parcel has left, the invoice is issued (imported here to avoid a circular import)
    if (!this.isNew && this.isModified("status") && ["shipped", "delivered"].includes(this.status) && !this.invoice?.number) {
      const { assignInvoice } = await import("../services/invoiceService.js");
      await assignInvoice(this);
    }
    next();
  } catch (err) {
    next(err);
  }
});

const Order = mongoose.model("Order", orderSchema);
export default Order;
