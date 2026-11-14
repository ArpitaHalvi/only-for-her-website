/**
 * NoSQL-operator injection guard.
 *
 * express-mongo-sanitize 2.x assigns to req.query, which is read-only in
 * Express 5, so it can not be used here. Express 5 also parses query strings
 * with the "simple" parser (no nested objects), so only JSON bodies and route
 * params can carry operators such as {"$ne": null} or {"$gt": ""}.
 *
 * Any key starting with "$" is removed, at every depth, in place.
 */
function strip(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 20) return value;

  if (Array.isArray(value)) {
    for (const item of value) strip(item, depth + 1);
    return value;
  }

  for (const key of Object.keys(value)) {
    if (key.startsWith("$")) {
      delete value[key];
    } else {
      strip(value[key], depth + 1);
    }
  }
  return value;
}

export default function sanitizeInput(req, _res, next) {
  if (req.body) strip(req.body);
  if (req.params) strip(req.params);
  next();
}
