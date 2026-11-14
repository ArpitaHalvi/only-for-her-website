import mongoose from "mongoose";

// One record per payment attempt or refund of an order: an audit trail of
// what the gateway told us, kept apart from the order itself.
const paymentTransactionSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    provider: { type: String, default: "razorpay" },

    razorpayOrderId: { type: String, index: true, sparse: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpaySignature: { type: String },
    razorpayRefundId: { type: String },

    status: {
      type: String,
      enum: ["created", "authorized", "captured", "failed", "refunded", "partially_refunded"],
      default: "created",
    },

    amount: { type: Number, default: 0 }, // rupees
    tax: { type: Number, default: 0 },
    fee: { type: Number, default: 0 },
    amountRefunded: { type: Number, default: 0 },

    requestPayload: { type: mongoose.Schema.Types.Mixed },
    responsePayload: { type: mongoose.Schema.Types.Mixed },
    failureReason: { type: String },

    paidAt: { type: Date },
    refundedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

const PaymentTransaction = mongoose.model("PaymentTransaction", paymentTransactionSchema);
export default PaymentTransaction;
