/**
 * Dashboard numbers and business reports for the admin console.
 *
 *   GET /api/v1/admin/dashboard                       the home screen (counts, charts, recent sales)
 *   GET /api/v1/admin/reports/:type                   revenue | orders | products | inventory | customers | coupons | funnel
 *       query: from, to (YYYY-MM-DD, default last 30 days), period=day|week|month, limit, format=csv
 *
 * "Revenue" is money received and kept: paid orders (cash on delivery counts
 * once delivered) that were not cancelled, returned or refunded.
 * Days are cut at midnight India time.
 */
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import ProductCategory from "../models/productCategory.model.js";
import Customer from "../models/customer.model.js";
import Coupon from "../models/coupon.model.js";
import Cart from "../models/cart.model.js";
import { can } from "../middleware/permissions.js";
import { sendCsv } from "../utils/csv.js";

const TZ = "Asia/Kolkata";
const REVENUE = {
  paymentStatus: { $in: ["paid", "partially_refunded"] },
  status: { $nin: ["cancelled", "failed", "returned", "refunded"] },
};
const PLACED = { status: { $nin: ["failed"] } }; // orders the customer actually placed
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const sendError = (res, err) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error("analytics error:", err);
  return res.status(500).json({ success: false, message: "Server error." });
};
const fail = (status, message) => Object.assign(new Error(message), { status });

/** from/to as dates; to is end of day. Default: the last 30 days. */
function range(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 29 * 24 * 3600 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw fail(400, "from / to must be dates like 2026-01-31.");
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (from > to) throw fail(400, "from must be before to.");
  if (to - from > 800 * 24 * 3600 * 1000) throw fail(400, "Please choose a range of at most 2 years.");
  return { from, to };
}
const periodOf = (v) => (["day", "week", "month"].includes(v) ? v : "day");
const bucket = (period, field = "$createdAt") => ({
  $dateTrunc: { date: field, unit: period, timezone: TZ, startOfWeek: "monday" },
});
const limitOf = (q, def = 10) => Math.min(Math.max(parseInt(q.limit) || def, 1), 200);

// ─── Reusable pieces ──────────────────────────────────────────────────────

const revenueSeries = (from, to, period) =>
  Order.aggregate([
    { $match: { ...REVENUE, createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: bucket(period), revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: "$_id", revenue: { $round: ["$revenue", 2] }, orders: 1 } },
  ]);

const ordersSeries = (from, to, period) =>
  Order.aggregate([
    { $match: { ...PLACED, createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: bucket(period), orders: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: "$_id", orders: 1, cancelled: 1 } },
  ]);

const bestSellers = (from, to, limit) =>
  Order.aggregate([
    { $match: { ...REVENUE, createdAt: { $gte: from, $lte: to } } },
    { $unwind: "$items" },
    { $group: { _id: "$items.product", name: { $first: "$items.name" }, image: { $first: "$items.image" }, units: { $sum: "$items.quantity" }, revenue: { $sum: "$items.lineTotal" } } },
    { $sort: { units: -1, revenue: -1 } },
    { $limit: limit },
    { $project: { _id: 0, productId: "$_id", name: 1, image: 1, units: 1, revenue: { $round: ["$revenue", 2] } } },
  ]);

async function categorySales(from, to) {
  const rows = await Order.aggregate([
    { $match: { ...REVENUE, createdAt: { $gte: from, $lte: to } } },
    { $unwind: "$items" },
    { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "p", pipeline: [{ $project: { category: 1 } }] } },
    { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
    { $group: { _id: "$p.category", units: { $sum: "$items.quantity" }, revenue: { $sum: "$items.lineTotal" } } },
  ]);
  const cats = await ProductCategory.find().select("name parent").setOptions({ withDeleted: true }).lean();
  const byId = new Map(cats.map((c) => [String(c._id), c]));
  // Sales of a sub-category are shown under its top-level category
  const topOf = (id) => {
    let c = byId.get(String(id));
    for (let i = 0; c?.parent && i < 10; i++) c = byId.get(String(c.parent)) || c;
    return c;
  };
  const merged = new Map();
  for (const r of rows) {
    const top = topOf(r._id);
    const key = top ? String(top._id) : "none";
    const cur = merged.get(key) || { categoryId: top?._id || null, category: top?.name || "Uncategorised", units: 0, revenue: 0 };
    cur.units += r.units;
    cur.revenue += r.revenue;
    merged.set(key, cur);
  }
  return [...merged.values()].map((c) => ({ ...c, revenue: round2(c.revenue) })).sort((a, b) => b.revenue - a.revenue);
}

const paymentSplit = (from, to) =>
  Order.aggregate([
    { $match: { ...PLACED, createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: "$paymentMethod", orders: { $sum: 1 }, amount: { $sum: "$totalAmount" } } },
    { $project: { _id: 0, method: "$_id", orders: 1, amount: { $round: ["$amount", 2] } } },
    { $sort: { orders: -1 } },
  ]);

/** Products (or options) at or below their low-stock level, and sold out ones */
async function stockCounts() {
  const rows = await Product.aggregate([
    { $match: { deletedAt: null, isActive: true, isCustom: { $ne: true } } },
    {
      $project: {
        out: { $cond: [{ $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] }, { $not: [{ $anyElementTrue: [{ $map: { input: "$variants", as: "v", in: { $gt: ["$$v.stock", 0] } } }] }] }, { $lte: ["$stock", 0] }], },
        low: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] },
            { $anyElementTrue: [{ $map: { input: "$variants", as: "v", in: { $lte: ["$$v.stock", "$lowStockThreshold"] } } }] },
            { $lte: ["$stock", "$lowStockThreshold"] },
          ],
        },
      },
    },
    { $group: { _id: null, lowStock: { $sum: { $cond: ["$low", 1, 0] } }, outOfStock: { $sum: { $cond: ["$out", 1, 0] } } } },
  ]);
  return { lowStock: rows[0]?.lowStock || 0, outOfStock: rows[0]?.outOfStock || 0 };
}

// ─── Dashboard ────────────────────────────────────────────────────────────

export const getDashboard = async (req, res) => {
  try {
    const showMoney = can(req.user.role, "reports");
    const { from, to } = range(req.query);
    const period = periodOf(req.query.period);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

    const [byStatus, totalOrders, totalCustomers, totalProducts, stock, recent, revenueAll, today, month] = await Promise.all([
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.countDocuments(PLACED),
      Customer.countDocuments(),
      Product.countDocuments({ deletedAt: null }),
      stockCounts(),
      Order.find(PLACED).sort({ createdAt: -1 }).limit(10).select("orderNo customerName status paymentMethod paymentStatus totalAmount createdAt").lean(),
      showMoney ? Order.aggregate([{ $match: REVENUE }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]) : [],
      showMoney ? Order.aggregate([{ $match: { ...REVENUE, createdAt: { $gte: startOfToday } } }, { $group: { _id: null, total: { $sum: "$totalAmount" }, n: { $sum: 1 } } }]) : [],
      showMoney ? Order.aggregate([{ $match: { ...REVENUE, createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: "$totalAmount" }, n: { $sum: 1 } } }]) : [],
    ]);
    const status = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));

    const data = {
      range: { from, to, period },
      totals: {
        totalOrders,
        totalCustomers,
        totalProducts,
        pendingOrders: status.pending || 0,
        confirmedOrders: status.confirmed || 0,
        processingOrders: status.processing || 0,
        shippedOrders: (status.shipped || 0) + (status.out_for_delivery || 0),
        deliveredOrders: status.delivered || 0,
        cancelledOrders: status.cancelled || 0,
        returnRequests: status.return_requested || 0,
        lowStockProducts: stock.lowStock,
        outOfStockProducts: stock.outOfStock,
      },
      ordersByStatus: status,
      recentSales: showMoney ? recent : recent.map(({ totalAmount, ...r }) => r),
    };

    if (showMoney) {
      const [revenue, orders, best, cats, payments] = await Promise.all([
        revenueSeries(from, to, period),
        ordersSeries(from, to, period),
        bestSellers(from, to, 5),
        categorySales(from, to),
        paymentSplit(from, to),
      ]);
      data.totals.totalRevenue = round2(revenueAll[0]?.total || 0);
      data.totals.revenueToday = round2(today[0]?.total || 0);
      data.totals.revenueThisMonth = round2(month[0]?.total || 0);
      data.totals.averageOrderValue = month[0]?.n ? round2(month[0].total / month[0].n) : 0;
      data.charts = { revenue, orders, bestSellers: best, categorySales: cats, paymentMethods: payments };
    } else {
      data.charts = { orders: await ordersSeries(from, to, period) };
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
};

// ─── Reports ──────────────────────────────────────────────────────────────

const REPORTS = {
  async revenue({ from, to, period }) {
    const [series, split, totals] = await Promise.all([
      revenueSeries(from, to, period),
      paymentSplit(from, to),
      Order.aggregate([
        { $match: { ...REVENUE, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: null, revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 }, discount: { $sum: "$discount" }, shipping: { $sum: "$shippingCharge" }, tax: { $sum: "$tax" } } },
      ]),
    ]);
    const t = totals[0] || {};
    return {
      summary: {
        revenue: round2(t.revenue || 0), orders: t.orders || 0,
        averageOrderValue: t.orders ? round2(t.revenue / t.orders) : 0,
        discountsGiven: round2(t.discount || 0), shippingCollected: round2(t.shipping || 0), taxIncluded: round2(t.tax || 0),
      },
      series, paymentMethods: split,
      csv: { rows: series, columns: [["Period", (r) => new Date(r.date).toISOString().slice(0, 10)], ["Orders", "orders"], ["Revenue", "revenue"]] },
    };
  },

  async orders({ from, to, period }) {
    const [series, byStatus, refunds] = await Promise.all([
      ordersSeries(from, to, period),
      Order.aggregate([{ $match: { ...PLACED, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: "$status", orders: { $sum: 1 }, amount: { $sum: "$totalAmount" } } }, { $sort: { orders: -1 } }]),
      Order.countDocuments({ createdAt: { $gte: from, $lte: to }, status: { $in: ["returned", "refunded", "return_requested"] } }),
    ]);
    const total = byStatus.reduce((s, r) => s + r.orders, 0);
    return {
      summary: { orders: total, returnedOrRequested: refunds, cancelled: byStatus.find((r) => r._id === "cancelled")?.orders || 0 },
      series, byStatus: byStatus.map((r) => ({ status: r._id, orders: r.orders, amount: round2(r.amount) })),
      csv: { rows: byStatus, columns: [["Status", "_id"], ["Orders", "orders"], ["Amount", (r) => round2(r.amount)]] },
    };
  },

  async products({ from, to, limit }) {
    const rows = await Order.aggregate([
      { $match: { ...REVENUE, createdAt: { $gte: from, $lte: to } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.product", name: { $first: "$items.name" }, sku: { $first: "$items.sku" }, units: { $sum: "$items.quantity" }, revenue: { $sum: "$items.lineTotal" }, orders: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ]);
    const ids = rows.map((r) => r._id);
    const info = await Product.find({ _id: { $in: ids } }).select("rating reviewCount stock").setOptions({ withDeleted: true }).lean();
    const byId = new Map(info.map((p) => [String(p._id), p]));
    const data = rows.map((r) => ({ productId: r._id, name: r.name, sku: r.sku, units: r.units, orders: r.orders, revenue: round2(r.revenue), rating: byId.get(String(r._id))?.rating ?? 0, reviews: byId.get(String(r._id))?.reviewCount ?? 0, stockLeft: byId.get(String(r._id))?.stock ?? null }));
    // Products that did not sell at all in the range
    const soldIds = (await Order.distinct("items.product", { ...REVENUE, createdAt: { $gte: from, $lte: to } })).map(String);
    const neverSold = await Product.find({ deletedAt: null, isActive: true, _id: { $nin: soldIds } }).select("name sku stock").limit(50).lean();
    return {
      topProducts: data,
      notSold: neverSold,
      csv: { rows: data, columns: [["Product", "name"], ["SKU", "sku"], ["Units sold", "units"], ["Orders", "orders"], ["Revenue", "revenue"], ["Rating", "rating"], ["Reviews", "reviews"]] },
    };
  },

  async inventory({ limit }) {
    const products = await Product.find({ deletedAt: null, isCustom: { $ne: true } }).select("name sku stock variants isActive lowStockThreshold price salePrice").sort({ name: 1 }).limit(5000).lean();
    const rows = products.flatMap((p) => {
      const price = p.salePrice ?? p.price;
      if (p.variants?.length) return p.variants.map((v) => ({ name: p.name, variant: v.name, sku: v.sku, stock: v.stock, threshold: p.lowStockThreshold, value: round2(v.stock * (v.salePrice ?? v.price ?? price)), published: p.isActive }));
      return [{ name: p.name, variant: "", sku: p.sku, stock: p.stock, threshold: p.lowStockThreshold, value: round2(p.stock * price), published: p.isActive }];
    });
    const state = (r) => (r.stock <= 0 ? "out_of_stock" : r.stock <= r.threshold ? "low" : "ok");
    const withState = rows.map((r) => ({ ...r, state: state(r) }));
    return {
      summary: {
        items: rows.length,
        outOfStock: withState.filter((r) => r.state === "out_of_stock").length,
        lowStock: withState.filter((r) => r.state === "low").length,
        unitsInStock: rows.reduce((s, r) => s + r.stock, 0),
        stockValueAtSellingPrice: round2(rows.reduce((s, r) => s + r.value, 0)),
      },
      attention: withState.filter((r) => r.state !== "ok").sort((a, b) => a.stock - b.stock).slice(0, limit * 5),
      csv: { rows: withState, columns: [["Product", "name"], ["Option", "variant"], ["SKU", "sku"], ["Stock", "stock"], ["Low-stock level", "threshold"], ["Status", "state"], ["Stock value", "value"], ["Published", "published"]] },
    };
  },

  async customers({ from, to, period, limit }) {
    const [newSeries, top, repeat] = await Promise.all([
      Customer.aggregate([{ $match: { createdAt: { $gte: from, $lte: to } } }, { $group: { _id: bucket(period), customers: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $project: { _id: 0, date: "$_id", customers: 1 } }]),
      Order.aggregate([
        { $match: { ...REVENUE, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$customer", name: { $first: "$customerName" }, orders: { $sum: 1 }, spent: { $sum: "$totalAmount" } } },
        { $sort: { spent: -1 } },
        { $limit: limit },
      ]),
      Order.aggregate([{ $match: { ...REVENUE } }, { $group: { _id: "$customer", orders: { $sum: 1 } } }, { $group: { _id: null, buyers: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gt: ["$orders", 1] }, 1, 0] } } } }]),
    ]);
    const total = await Customer.countDocuments();
    const newInRange = newSeries.reduce((s, r) => s + r.customers, 0);
    const buyers = repeat[0]?.buyers || 0;
    return {
      summary: { totalCustomers: total, newInRange, buyers, repeatBuyers: repeat[0]?.repeat || 0, repeatRate: buyers ? round2(((repeat[0]?.repeat || 0) / buyers) * 100) : 0 },
      newCustomers: newSeries,
      topCustomers: top.map((t) => ({ customerId: t._id, name: t.name, orders: t.orders, spent: round2(t.spent) })),
      csv: { rows: top, columns: [["Customer", "name"], ["Orders", "orders"], ["Total spent", (r) => round2(r.spent)]] },
    };
  },

  async coupons({ from, to }) {
    const used = await Order.aggregate([
      { $match: { ...PLACED, couponCode: { $exists: true, $ne: null, $nin: [""] }, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$couponCode", orders: { $sum: 1 }, discount: { $sum: "$discount" }, revenue: { $sum: "$totalAmount" } } },
      { $sort: { orders: -1 } },
    ]);
    const coupons = await Coupon.find({ code: { $in: used.map((u) => u._id) } }).select("code type value usedCount usageLimit isActive").lean();
    const byCode = new Map(coupons.map((c) => [c.code, c]));
    const rows = used.map((u) => ({ code: u._id, type: byCode.get(u._id)?.type, value: byCode.get(u._id)?.value, orders: u.orders, discountGiven: round2(u.discount), orderRevenue: round2(u.revenue), usedTotal: byCode.get(u._id)?.usedCount ?? null, active: byCode.get(u._id)?.isActive ?? false }));
    return {
      summary: { couponsUsed: rows.length, orders: rows.reduce((s, r) => s + r.orders, 0), discountGiven: round2(rows.reduce((s, r) => s + r.discountGiven, 0)) },
      coupons: rows,
      csv: { rows, columns: [["Code", "code"], ["Type", "type"], ["Value", "value"], ["Orders", "orders"], ["Discount given", "discountGiven"], ["Order revenue", "orderRevenue"], ["Active", "active"]] },
    };
  },

  /**
   * Conversion and abandonment. The store has no visitor counter, so conversion
   * is measured among shoppers who showed buying intent: those who placed an
   * order versus those who left items in the cart and did not buy.
   */
  async funnel({ from, to }) {
    const [placed, completed, cartRows, abandoned, aov] = await Promise.all([
      Order.countDocuments({ ...PLACED, createdAt: { $gte: from, $lte: to } }),
      Order.countDocuments({ ...REVENUE, createdAt: { $gte: from, $lte: to } }),
      Cart.countDocuments({ "items.0": { $exists: true }, updatedAt: { $gte: from, $lte: to } }),
      // Carts with items, untouched for over 1 hour, whose owner has not ordered since
      Cart.aggregate([
        { $match: { "items.0": { $exists: true }, updatedAt: { $gte: from, $lte: new Date(Math.min(to.getTime(), Date.now() - 3600 * 1000)) } } },
        { $lookup: { from: "orders", let: { c: "$customer", u: "$updatedAt" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$customer", "$$c"] }, { $gte: ["$createdAt", "$$u"] }, { $ne: ["$status", "failed"] }] } } }, { $limit: 1 }], as: "after" } },
        { $match: { after: { $size: 0 } } },
        { $count: "n" },
      ]),
      Order.aggregate([{ $match: { ...REVENUE, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: null, revenue: { $sum: "$totalAmount" }, n: { $sum: 1 } } }]),
    ]);
    const abandonedCarts = abandoned[0]?.n || 0;
    const intent = placed + abandonedCarts;
    return {
      summary: {
        ordersPlaced: placed,
        ordersCompleted: completed,
        cartsWithItems: cartRows,
        abandonedCarts,
        conversionRate: intent ? round2((placed / intent) * 100) : 0,
        cartAbandonmentRate: intent ? round2((abandonedCarts / intent) * 100) : 0,
        averageOrderValue: aov[0]?.n ? round2(aov[0].revenue / aov[0].n) : 0,
      },
      note: "Conversion = orders placed / (orders placed + abandoned carts). There is no visitor counter, so this measures shoppers who showed buying intent.",
      csv: null,
    };
  },
};

export const getReport = async (req, res) => {
  try {
    const type = req.params.type;
    if (!Object.hasOwn(REPORTS, type)) throw fail(404, `Unknown report. Reports: ${Object.keys(REPORTS).join(", ")}.`);
    const { from, to } = range(req.query);
    const result = await REPORTS[type]({ from, to, period: periodOf(req.query.period), limit: limitOf(req.query) });

    if (req.query.format === "csv") {
      if (!result.csv) throw fail(400, "This report has no CSV export.");
      return sendCsv(res, `${type}-report-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv`, result.csv.rows, result.csv.columns);
    }
    delete result.csv;
    res.status(200).json({ success: true, data: { type, range: { from, to }, ...result } });
  } catch (err) {
    sendError(res, err);
  }
};
