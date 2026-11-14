import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import appConfig from "../models/appConfig.model.js";
import ReturnRequest, { RETURN_REASONS, RETURN_STATUSES, RETURN_TYPES } from "../models/returnRequest.model.js";
import { releaseStock } from "../utils/stock.js";
import { refundOrder, addHistory } from "../services/orderService.js";
import { uploadToCloudinary } from "../utils/cloudinaryService.js";
import { isAllowedFileOnDisk, removeFile } from "../utils/fileSignature.js";
import { sendMail } from "../utils/mailer.js";
import { can } from "../middleware/permissions.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const fail = (status, message) => Object.assign(new Error(message), { status });
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
const round2 = (n) => Math.round(n * 100) / 100;

const sendError = (res, err) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: Object.values(err.errors).map((e) => e.message).join(" ") });
  }
  console.error("return error:", err.message);
  return res.status(500).json({ success: false, message: "Server error." });
};

const paging = (query, def = 20) => {
  const page = Math.min(Math.max(parseInt(query.page) || 1, 1), 10000);
  const limit = Math.min(Math.max(parseInt(query.limit) || def, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

// Statuses of a request that no longer count against what can still be returned
const INACTIVE = ["rejected", "cancelled", "closed"];
const itemKey = (i) => `${i.product}:${i.variantId ?? ""}`;
const parseMaybeJson = (v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    throw fail(400, "The items are not valid.");
  }
};

async function notify(request, subject, lines) {
  if (!request.customerEmail) return;
  const site = (process.env.NEXT_FRONTEND_URL || "").replace(/\/+$/, "");
  await sendMail({
    to: request.customerEmail,
    subject,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px">${esc(subject)}</h2>
      ${lines.map((l) => `<p>${esc(l)}</p>`).join("")}
      <p style="color:#707f94;font-size:13px">Request ${esc(request.requestNo)} &middot; Order ${esc(request.orderNo)}${site ? ` &middot; <a href="${esc(site)}/account/returns">View your returns</a>` : ""}</p>
    </div>`,
  }).catch((err) => console.error("return email failed:", err.message));
}

// ─── Customer ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/returns  (JSON, or multipart with up to 4 "photos")
 * Body: { orderId, type: "return"|"exchange", reason, comment?, items: [{ product, variantId?, quantity }] }
 */
export const createReturn = async (req, res) => {
  const files = req.files?.photos || [];
  try {
    const { orderId, reason, comment } = req.body;
    const type = req.body.type || "return";
    if (!isObjectId(orderId)) throw fail(400, "Choose the order.");
    if (!RETURN_TYPES.includes(type)) throw fail(400, "type must be return or exchange.");
    if (!RETURN_REASONS.includes(reason)) throw fail(400, "Please choose a reason.");
    if (comment !== undefined && (typeof comment !== "string" || comment.length > 1000)) throw fail(400, "The comment is too long (1000 characters at most).");

    const wanted = parseMaybeJson(req.body.items);
    if (!Array.isArray(wanted) || !wanted.length || wanted.length > 50) throw fail(400, "Choose at least one item.");

    const order = await Order.findOne({ _id: orderId, customer: req.customer._id });
    if (!order) throw fail(404, "Order not found.");
    if (order.status !== "delivered" || !order.deliveredAt) throw fail(400, "Only delivered orders can be returned.");

    const settings = (await appConfig.findOne().select("returnWindowDays").lean()) || {};
    const windowDays = settings.returnWindowDays ?? 7;
    if (windowDays <= 0) throw fail(400, "Returns are not available right now.");
    const deadline = new Date(order.deliveredAt.getTime() + windowDays * 24 * 3600 * 1000);
    if (new Date() > deadline) throw fail(400, `The ${windowDays}-day return window for this order has ended.`);

    if (["damaged", "wrong_item"].includes(reason) && !files.length) {
      throw fail(400, "Please attach a photo of the item so we can sort this out quickly.");
    }

    // What has already been asked for on this order
    const existing = await ReturnRequest.find({ order: order._id, status: { $nin: INACTIVE } }).select("items").lean();
    const taken = new Map();
    for (const r of existing) for (const i of r.items) taken.set(itemKey(i), (taken.get(itemKey(i)) || 0) + i.quantity);

    const products = await Product.find({ _id: { $in: order.items.map((i) => i.product) } }).select("returnable name").setOptions({ withDeleted: true }).lean();
    const returnable = new Map(products.map((p) => [String(p._id), p.returnable !== false]));

    const items = [];
    const seen = new Set();
    for (const w of wanted) {
      if (!isObjectId(w?.product) || (w.variantId && !isObjectId(w.variantId))) throw fail(400, "One of the items is not valid.");
      const key = itemKey(w);
      if (seen.has(key)) throw fail(400, "The same item is listed twice.");
      seen.add(key);

      const line = order.items.find((i) => itemKey(i) === key);
      if (!line) throw fail(400, "One of the items is not part of this order.");
      const qty = Number(w.quantity);
      if (!Number.isInteger(qty) || qty < 1) throw fail(400, "Enter a valid quantity.");
      const left = line.quantity - (taken.get(key) || 0);
      if (qty > left) throw fail(400, left <= 0 ? `"${line.name}" already has a return request.` : `You can return at most ${left} of "${line.name}".`);

      // Items sold as final-sale can only come back if they are faulty
      if (returnable.get(String(line.product)) === false && !["damaged", "wrong_item", "not_as_described", "quality_issue"].includes(reason)) {
        throw fail(400, `"${line.name}" cannot be returned unless it is faulty or not as described.`);
      }

      items.push({
        product: line.product,
        variantId: line.variantId || null,
        name: line.name,
        variantName: line.variantName,
        sku: line.sku,
        image: line.image,
        price: line.price,
        quantity: qty,
      });
    }

    // Photos: real images only
    const photos = [];
    for (const file of files.slice(0, 4)) {
      if (!(await isAllowedFileOnDisk(file.path))) throw fail(400, "Photos must be JPG, PNG, GIF or WebP images.");
    }
    for (const file of files.slice(0, 4)) {
      const up = await uploadToCloudinary(file.path, "only-for-her/returns");
      photos.push({ url: up.secure_url, publicId: up.public_id });
    }

    const request = await ReturnRequest.create({
      order: order._id,
      orderNo: order.orderNo,
      customer: req.customer._id,
      customerEmail: order.customerEmail || req.customer.email,
      type,
      reason,
      comment: comment?.trim(),
      photos,
      items,
    });

    // The order shows "Return requested" while a return is open
    if (type === "return" && order.status === "delivered") {
      order.status = "return_requested";
      addHistory(order, "return_requested", "customer", `Return requested (${request.requestNo})`);
      await order.save();
    }

    void notify(request, `We received your ${type} request`, [
      "Thank you. Our team will review it and email you the next steps, usually within 1 to 2 working days.",
    ]);

    res.status(201).json({ success: true, message: "Your request has been sent.", data: request });
  } catch (err) {
    sendError(res, err);
  } finally {
    // Never leave temp files behind (uploadToCloudinary removes the ones it used)
    await Promise.all(files.map((f) => removeFile(f.path)));
  }
};

// GET /api/v1/returns/my
export const getMyReturns = async (req, res) => {
  try {
    const { page, limit, skip } = paging(req.query, 10);
    const [total, data] = await Promise.all([
      ReturnRequest.countDocuments({ customer: req.customer._id }),
      ReturnRequest.find({ customer: req.customer._id }).select("-adminNote").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    res.status(200).json({ success: true, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/v1/returns/my/:id
export const getMyReturn = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) throw fail(400, "Invalid request.");
    const data = await ReturnRequest.findOne({ _id: req.params.id, customer: req.customer._id }).select("-adminNote").lean();
    if (!data) throw fail(404, "Return request not found.");
    res.status(200).json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/v1/returns/eligibility/:orderId — what can still be returned from an order
export const getEligibility = async (req, res) => {
  try {
    if (!isObjectId(req.params.orderId)) throw fail(400, "Invalid order.");
    const order = await Order.findOne({ _id: req.params.orderId, customer: req.customer._id });
    if (!order) throw fail(404, "Order not found.");
    const settings = (await appConfig.findOne().select("returnWindowDays").lean()) || {};
    const windowDays = settings.returnWindowDays ?? 7;
    const deadline = order.deliveredAt ? new Date(order.deliveredAt.getTime() + windowDays * 24 * 3600 * 1000) : null;
    const open = order.status === "delivered" && windowDays > 0 && deadline && new Date() <= deadline;

    const existing = await ReturnRequest.find({ order: order._id, status: { $nin: INACTIVE } }).select("items").lean();
    const taken = new Map();
    for (const r of existing) for (const i of r.items) taken.set(itemKey(i), (taken.get(itemKey(i)) || 0) + i.quantity);

    res.status(200).json({
      success: true,
      data: {
        eligible: !!open,
        windowDays,
        deadline,
        items: order.items.map((i) => ({
          product: i.product,
          variantId: i.variantId,
          name: i.name,
          variantName: i.variantName,
          image: i.image,
          price: i.price,
          ordered: i.quantity,
          canReturn: open ? Math.max(i.quantity - (taken.get(itemKey(i)) || 0), 0) : 0,
        })),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/v1/returns/my/:id/cancel — only while the shop has not answered yet
export const cancelMyReturn = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) throw fail(400, "Invalid request.");
    const request = await ReturnRequest.findOneAndUpdate(
      { _id: req.params.id, customer: req.customer._id, status: "requested" },
      { $set: { status: "cancelled" }, $push: { statusHistory: { status: "cancelled", by: "customer", at: new Date(), note: "Withdrawn by the customer" } } },
      { new: true },
    ).select("-adminNote");
    if (!request) throw fail(400, "This request can no longer be cancelled.");
    res.status(200).json({ success: true, message: "Request cancelled.", data: request });
  } catch (err) {
    sendError(res, err);
  }
};

// ─── Admin / staff ────────────────────────────────────────────────────────────

// GET /api/v1/admin/returns?status=&type=&q=&page=&limit=
export const getAllReturns = async (req, res) => {
  try {
    const { page, limit, skip } = paging(req.query);
    const query = {};
    if (req.query.status) {
      if (!RETURN_STATUSES.includes(req.query.status)) throw fail(400, "Unknown status.");
      query.status = req.query.status;
    }
    if (req.query.type) {
      if (!RETURN_TYPES.includes(req.query.type)) throw fail(400, "Unknown type.");
      query.type = req.query.type;
    }
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ requestNo: rx }, { orderNo: rx }, { customerEmail: rx }];
    }
    const [total, data, counts] = await Promise.all([
      ReturnRequest.countDocuments(query),
      ReturnRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ReturnRequest.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    res.status(200).json({
      success: true,
      data,
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/v1/admin/returns/:id
export const getReturn = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) throw fail(400, "Invalid request.");
    const data = await ReturnRequest.findById(req.params.id).populate("order", "orderNo status paymentMethod paymentStatus totalAmount deliveredAt").lean();
    if (!data) throw fail(404, "Return request not found.");
    res.status(200).json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
};

// Which status can follow which
const FLOW = {
  requested: ["approved", "rejected"],
  approved: ["pickup_scheduled", "received", "rejected", "closed"],
  pickup_scheduled: ["received", "closed"],
  received: ["refunded", "exchanged", "closed"],
  refunded: [],
  exchanged: [],
  rejected: [],
  closed: [],
  cancelled: [],
};

/** Total already refunded on this order through returns */
async function refundedSoFar(orderId, exceptId) {
  const rows = await ReturnRequest.aggregate([
    { $match: { order: orderId, status: "refunded", _id: { $ne: exceptId } } },
    { $group: { _id: null, total: { $sum: "$refundAmount" } } },
  ]);
  return rows[0]?.total || 0;
}

/** When every unit of an order is back, the order itself becomes "returned". */
async function markOrderReturnedIfComplete(request) {
  const order = await Order.findById(request.order);
  if (!order || !["delivered", "return_requested"].includes(order.status)) return;
  const received = await ReturnRequest.find({ order: order._id, type: "return", status: { $in: ["received", "refunded"] } }).select("items").lean();
  const back = new Map();
  for (const r of received) for (const i of r.items) back.set(itemKey(i), (back.get(itemKey(i)) || 0) + i.quantity);
  if (order.items.every((i) => (back.get(itemKey(i)) || 0) >= i.quantity)) {
    order.status = "returned";
    addHistory(order, "returned", "admin", `All items returned (${request.requestNo})`);
    await order.save();
  }
}

/** Order status follows the requests: back to "delivered" when none is open; "refunded" once returned goods are paid back. */
async function syncOrderAfterReturn(request) {
  const order = await Order.findById(request.order);
  if (!order) return;
  if (order.status === "return_requested") {
    const open = await ReturnRequest.countDocuments({ order: order._id, type: "return", status: { $nin: INACTIVE.concat(["refunded", "received", "exchanged"]) } });
    if (!open) {
      order.status = "delivered";
      addHistory(order, "delivered", "admin", "Return request closed");
      await order.save();
    }
  } else if (order.status === "returned" && request.status === "refunded") {
    order.status = "refunded";
    addHistory(order, "refunded", "admin", `Refund issued (${request.requestNo})`);
    await order.save();
  }
}

/**
 * PATCH /api/v1/admin/returns/:id/status
 * Body: { status, adminNote?, restock?, refundAmount?, pickup?: { courierName, trackingNumber, scheduledAt } }
 */
export const updateReturnStatus = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) throw fail(400, "Invalid request.");
    const { status, adminNote, restock, refundAmount, pickup } = req.body;
    if (!RETURN_STATUSES.includes(status)) throw fail(400, "Unknown status.");
    if (adminNote !== undefined && (typeof adminNote !== "string" || adminNote.length > 1000)) throw fail(400, "The note is too long.");

    const request = await ReturnRequest.findById(req.params.id);
    if (!request) throw fail(404, "Return request not found.");
    if (!FLOW[request.status].includes(status)) throw fail(400, `A request that is "${request.status}" cannot move to "${status}".`);
    if (status === "refunded" && request.type !== "return") throw fail(400, "Only returns can be refunded. Use exchanged for exchanges.");
    if (status === "exchanged" && request.type !== "exchange") throw fail(400, "Only exchanges can be marked exchanged.");
    if (status === "refunded" && !can(req.user.role, "refunds")) throw fail(403, "You do not have permission to issue refunds.");
    if (status === "rejected" && !(adminNote || "").trim()) throw fail(400, "Please tell the customer why it was rejected.");

    const by = req.user.email;
    let customerLines = [];

    if (status === "approved") {
      customerLines = ["Your request has been approved. Please pack the item(s) in their original packaging; we will share the pickup / shipping details shortly."];
    }

    if (status === "pickup_scheduled") {
      if (pickup && typeof pickup === "object") {
        const when = pickup.scheduledAt ? new Date(pickup.scheduledAt) : null;
        if (when && Number.isNaN(when.getTime())) throw fail(400, "The pickup date is not valid.");
        request.pickup = {
          courierName: typeof pickup.courierName === "string" ? pickup.courierName.trim().slice(0, 80) : undefined,
          trackingNumber: typeof pickup.trackingNumber === "string" ? pickup.trackingNumber.trim().slice(0, 80) : undefined,
          scheduledAt: when || undefined,
        };
      }
      customerLines = ["Your pickup has been arranged. Please keep the parcel ready."];
    }

    if (status === "received") {
      request.restock = restock === undefined ? !["damaged", "quality_issue"].includes(request.reason) : restock === true;
      // Stock goes back once only: the flag is flipped atomically before the units are returned
      if (request.restock && !request.restocked) {
        const flipped = await ReturnRequest.updateOne({ _id: request._id, restocked: false }, { $set: { restocked: true } });
        if (flipped.modifiedCount === 1) {
          request.restocked = true;
          await releaseStock(
            request.items.map((i) => ({ product: i.product, variantId: i.variantId, quantity: i.quantity, name: i.name, sku: i.sku })),
            { reason: "return", returnRequest: request._id, order: request.order, by, note: `Return ${request.requestNo}` },
          );
        }
      }
      customerLines = ["We have received your parcel and are checking it."];
    }

    if (status === "refunded") {
      const order = await Order.findById(request.order);
      if (!order) throw fail(404, "Order not found.");
      const itemsValue = round2(request.items.reduce((sum, i) => sum + i.price * i.quantity, 0));
      const amount = refundAmount === undefined || refundAmount === "" ? itemsValue : Number(refundAmount);
      if (!(amount > 0)) throw fail(400, "Enter the amount to refund.");
      const alreadyRefunded = await refundedSoFar(order._id, request._id);
      if (round2(amount + alreadyRefunded) > round2(order.totalAmount)) {
        throw fail(400, `This would refund more than the order total (₹${order.totalAmount}); ₹${alreadyRefunded} was already refunded.`);
      }

      if (order.paymentMethod === "razorpay" && order.paymentId) {
        // Money goes back to the customer's original payment method
        await refundOrder(order, { amount, reason: `Return ${request.requestNo}` });
        request.refundMethod = "original";
      } else {
        // Cash on delivery: the shop pays the customer by bank transfer / UPI, outside this system
        request.refundMethod = "manual";
      }
      request.refundAmount = amount;
      request.refundedAt = new Date();
      customerLines = [
        request.refundMethod === "original"
          ? `₹${amount} is being refunded to your original payment method. It usually shows up in 5 to 7 working days.`
          : `₹${amount} will be sent to you by bank transfer / UPI. We will contact you for the details.`,
      ];
    }

    if (status === "exchanged") customerLines = ["Your replacement is on its way."];
    if (status === "rejected") customerLines = ["We are sorry, we could not accept this request.", adminNote.trim()];

    if (adminNote !== undefined) request.adminNote = adminNote.trim();
    request.status = status;
    request.statusHistory.push({ status, by, at: new Date(), note: adminNote?.trim() });
    await request.save();

    if (status === "received" || status === "refunded") await markOrderReturnedIfComplete(request);
    await syncOrderAfterReturn(request);

    if (customerLines.length) void notify(request, `Update on your ${request.type} ${request.requestNo}`, customerLines);

    res.status(200).json({ success: true, message: "Request updated.", data: request });
  } catch (err) {
    sendError(res, err);
  }
};
