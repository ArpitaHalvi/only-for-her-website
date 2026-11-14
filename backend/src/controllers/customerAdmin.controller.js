/**
 * Customer management for the admin console.
 *   GET   /api/v1/admin/customers               list + search (name, email, mobile)
 *   GET   /api/v1/admin/customers/:id           profile, addresses, order history, spending
 *   PATCH /api/v1/admin/customers/:id           block / unblock, private notes
 *
 * Staff without the "customers_pii" permission (order managers, support agents)
 * see masked email / phone and no street addresses.
 */
import Customer from "../models/customer.model.js";
import Order from "../models/order.model.js";
import ContactUs from "../models/contactus.model.js";
import { can } from "../middleware/permissions.js";
import { sendCsv } from "../utils/csv.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sendError = (res, err) => {
  console.error("customerAdmin error:", err.message);
  return res.status(500).json({ success: false, message: "Server error." });
};

const maskEmail = (e) => {
  if (!e) return e;
  const [name, domain = ""] = e.split("@");
  return `${name.slice(0, 1)}${"*".repeat(Math.max(2, name.length - 1))}@${domain}`;
};
const maskPhone = (p) => (p ? `${"*".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : p);

// Orders that count as money received and kept
const SPENT = { paymentStatus: { $in: ["paid", "partially_refunded"] }, status: { $nin: ["cancelled", "failed", "returned", "refunded"] } };

async function statsFor(ids) {
  const rows = await Order.aggregate([
    { $match: { customer: { $in: ids }, status: { $nin: ["failed"] } } },
    {
      $group: {
        _id: "$customer",
        orders: { $sum: 1 },
        spent: { $sum: { $cond: [{ $and: [{ $in: ["$paymentStatus", ["paid", "partially_refunded"]] }, { $not: [{ $in: ["$status", ["cancelled", "returned", "refunded"]] }] }] }, "$totalAmount", 0] } },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

function present(c, stats, pii) {
  const s = stats.get(String(c._id));
  return {
    _id: c._id,
    name: c.name,
    email: pii ? c.email : maskEmail(c.email),
    phone: pii ? c.phone : maskPhone(c.phone),
    avatar: c.avatar,
    provider: c.provider,
    isActive: c.isActive !== false,
    isVerified: c.isVerified,
    marketingOptIn: pii ? c.marketingOptIn : undefined,
    createdAt: c.createdAt,
    lastLoginAt: c.lastLoginAt,
    orderCount: s?.orders || 0,
    totalSpent: Math.round((s?.spent || 0) * 100) / 100,
    lastOrderAt: s?.lastOrderAt || null,
  };
}

const PUBLIC_FIELDS = "name email phone avatar provider isActive isVerified marketingOptIn createdAt lastLoginAt";

function buildQuery(req, pii) {
  const { search, status } = req.query;
  const q = {};
  if (status === "active") q.isActive = { $ne: false };
  if (status === "blocked") q.isActive = false;
  if (search) {
    const term = String(search).trim().slice(0, 80);
    const rx = { $regex: escapeRegex(term), $options: "i" };
    // Without the PII permission only the name can be searched freely (no guessing emails / numbers)
    q.$or = pii ? [{ name: rx }, { email: rx }, { phone: rx }] : [{ name: rx }, { email: term.toLowerCase() }, { phone: term }];
  }
  return q;
}

// GET /api/v1/admin/customers
export const listCustomers = async (req, res) => {
  try {
    const pii = can(req.user.role, "customers_pii");
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const query = buildQuery(req, pii);

    const total = await Customer.countDocuments(query);
    const customers = await Customer.find(query).select(PUBLIC_FIELDS).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    const stats = await statsFor(customers.map((c) => c._id));
    res.status(200).json({
      success: true,
      data: customers.map((c) => present(c, stats, pii)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/v1/admin/customers/export — CSV of the same list (store manager / admin only)
export const exportCustomers = async (req, res) => {
  try {
    const query = buildQuery(req, true);
    const customers = await Customer.find(query).select(PUBLIC_FIELDS).sort({ createdAt: -1 }).limit(20000).lean();
    const stats = await statsFor(customers.map((c) => c._id));
    const rows = customers.map((c) => present(c, stats, true));
    sendCsv(res, "customers.csv", rows, [
      ["Name", "name"], ["Email", "email"], ["Phone", "phone"], ["Status", (r) => (r.isActive ? "Active" : "Blocked")],
      ["Orders", "orderCount"], ["Total spent", "totalSpent"], ["Last order", "lastOrderAt"], ["Joined", "createdAt"], ["Accepts marketing", "marketingOptIn"],
    ]);
  } catch (err) {
    sendError(res, err);
  }
};

// GET /api/v1/admin/customers/:id
export const getCustomer = async (req, res) => {
  try {
    const pii = can(req.user.role, "customers_pii");
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Customer not found." });
    const customer = await Customer.findById(req.params.id).select(`${PUBLIC_FIELDS} addresses wishlist notes`).lean();
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });

    const [stats, orders, enquiries] = await Promise.all([
      statsFor([customer._id]),
      Order.find({ customer: customer._id, status: { $ne: "failed" } })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("orderNo createdAt status paymentMethod paymentStatus totalAmount items.name items.quantity")
        .lean(),
      // Support requests this customer sent (matched on their email / phone)
      customer.email || customer.phone
        ? ContactUs.find({ $or: [customer.email ? { email: customer.email } : null, customer.phone ? { phone: customer.phone } : null].filter(Boolean) })
            .sort({ createdAt: -1 }).limit(20).select("type subject status createdAt").lean()
        : [],
    ]);

    const out = present(customer, stats, pii);
    out.notes = customer.notes;
    out.wishlistCount = customer.wishlist?.length || 0;
    // Street addresses only for staff allowed to see contact details
    out.addresses = pii ? customer.addresses : (customer.addresses || []).map((a) => ({ _id: a._id, label: a.label, city: a.city, state: a.state, pincode: a.pincode }));
    out.orders = orders;
    out.supportRequests = enquiries;
    out.averageOrderValue = out.orderCount ? Math.round((out.totalSpent / out.orderCount) * 100) / 100 : 0;
    res.status(200).json({ success: true, data: out });
  } catch (err) {
    sendError(res, err);
  }
};

// PATCH /api/v1/admin/customers/:id   { isActive?, notes? }
export const updateCustomer = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Customer not found." });
    const { isActive, notes } = req.body;
    if (isActive !== undefined && typeof isActive !== "boolean") return res.status(400).json({ success: false, message: "isActive must be true or false." });
    if (notes !== undefined && (typeof notes !== "string" || notes.length > 2000)) return res.status(400).json({ success: false, message: "Notes must be text of up to 2000 characters." });
    // Blocking someone is a bigger step than leaving a note
    if (isActive !== undefined && !can(req.user.role, "customers_pii") && req.user.role !== "support")
      return res.status(403).json({ success: false, message: "You do not have permission to block customers." });

    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
    if (isActive !== undefined) customer.isActive = isActive;
    if (notes !== undefined) customer.notes = notes;
    await customer.save();
    res.status(200).json({ success: true, message: "Customer updated.", data: { _id: customer._id, isActive: customer.isActive, notes: customer.notes } });
  } catch (err) {
    sendError(res, err);
  }
};
