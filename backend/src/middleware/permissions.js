/**
 * Staff roles and what each may do.
 *
 *   admin            everything ("Super Admin"; also every route guarded by plain `ensureAuth`)
 *   manager          "Store Manager": products, orders, inventory, customers, coupons, reports
 *   order_manager    orders, shipments, returns; sees customers with contact details hidden
 *   content_manager  homepage, banners, announcements, website pages, reviews
 *   support          customer enquiries, orders (no refunds), returns, reviews; contact details hidden
 *
 * Permissions: dashboard, catalog, orders, refunds, returns, inventory, reviews,
 * contact (enquiries), customers, customers_pii (see email / phone / addresses),
 * marketing (coupons), content, reports.
 *
 * Routes guarded by `ensureAuth` stay admin-only. Routes other staff may use are
 * guarded by `requirePermission("<permission>")` instead.
 */
export const ROLE_PERMISSIONS = {
  admin: ["*"],
  manager: [
    "dashboard", "catalog", "orders", "refunds", "returns", "inventory", "reviews",
    "contact", "customers", "customers_pii", "marketing", "reports", "shipping",
  ],
  order_manager: ["dashboard", "orders", "returns", "customers", "shipping"],
  content_manager: ["dashboard", "content", "reviews"],
  support: ["dashboard", "orders", "returns", "reviews", "contact", "customers"],
};

export const ROLE_LABELS = {
  admin: "Super Admin",
  manager: "Store Manager",
  order_manager: "Order Manager",
  content_manager: "Content Manager",
  support: "Support Agent",
};

export const STAFF_ROLES = Object.keys(ROLE_PERMISSIONS);

export const can = (role, permission) => {
  const list = ROLE_PERMISSIONS[role] || [];
  return list.includes("*") || list.includes(permission);
};
