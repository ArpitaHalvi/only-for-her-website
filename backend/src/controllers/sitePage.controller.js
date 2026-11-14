/**
 * Editable website pages (About Us, FAQ, policies, care guide ...).
 *
 *   GET /api/v1/site-pages/:key          public page (published only)
 *   GET /api/v1/site-pages               public list of published pages (key + title)
 *   GET /api/v1/admin/site-pages         admin: every page, including ones never written yet
 *   PUT /api/v1/admin/site-pages/:key    admin: create or update a page
 */
import SitePage, { PAGE_KEYS, PAGE_TITLES } from "../models/sitePage.model.js";

const sendError = (res, error) => {
  if (error.name === "ValidationError")
    return res.status(400).json({ success: false, message: Object.values(error.errors).map((e) => e.message).join(" ") });
  if (error.status && error.status < 500) return res.status(error.status).json({ success: false, message: error.message });
  console.error("[sitePage.controller.js]", error.message);
  return res.status(500).json({ success: false, message: "Internal Server Error" });
};

export const getPublicPage = async (req, res) => {
  try {
    if (!PAGE_KEYS.includes(req.params.key)) return res.status(404).json({ success: false, message: "Page not found." });
    const page = await SitePage.findOne({ key: req.params.key, isPublished: true }).select("-updatedBy");
    if (!page) return res.status(404).json({ success: false, message: "Page not found." });
    res.set("Cache-Control", "public, max-age=60");
    res.status(200).json({ success: true, data: page });
  } catch (error) {
    sendError(res, error);
  }
};

export const listPublicPages = async (_req, res) => {
  try {
    const pages = await SitePage.find({ isPublished: true }).select("key title").lean();
    res.status(200).json({ success: true, data: pages.map((p) => ({ key: p.key, title: p.title || PAGE_TITLES[p.key] })) });
  } catch (error) {
    sendError(res, error);
  }
};

export const listAdminPages = async (_req, res) => {
  try {
    const saved = await SitePage.find().lean();
    const byKey = new Map(saved.map((p) => [p.key, p]));
    // Pages not written yet are listed too, so the console can show an empty editor
    const data = PAGE_KEYS.map((key) => byKey.get(key) || { key, title: PAGE_TITLES[key], body: "", faqs: [], isPublished: false, exists: false });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

const TEXT_LIMITS = { title: 150, body: 100000, metaTitle: 70, metaDescription: 170 };

export const savePage = async (req, res) => {
  try {
    const { key } = req.params;
    if (!PAGE_KEYS.includes(key)) return res.status(404).json({ success: false, message: `Unknown page. Pages: ${PAGE_KEYS.join(", ")}.` });

    const data = {};
    for (const [field, max] of Object.entries(TEXT_LIMITS)) {
      if (req.body[field] === undefined) continue;
      if (typeof req.body[field] !== "string" || req.body[field].length > max)
        return res.status(400).json({ success: false, message: `${field} must be text of up to ${max} characters.` });
      data[field] = req.body[field];
    }
    if (req.body.isPublished !== undefined) {
      if (typeof req.body.isPublished !== "boolean") return res.status(400).json({ success: false, message: "isPublished must be true or false." });
      data.isPublished = req.body.isPublished;
    }
    if (req.body.faqs !== undefined) {
      if (!Array.isArray(req.body.faqs)) return res.status(400).json({ success: false, message: "faqs must be a list." });
      data.faqs = req.body.faqs
        .filter((f) => f?.question && f?.answer)
        .map((f, i) => ({ question: String(f.question), answer: String(f.answer), sortOrder: Number.isFinite(Number(f.sortOrder)) ? Number(f.sortOrder) : i }));
    }
    data.updatedBy = req.user?._id;

    const page = await SitePage.findOneAndUpdate(
      { key },
      { $set: data, $setOnInsert: { key } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    if (!page.title) {
      page.title = PAGE_TITLES[key];
      await page.save();
    }
    res.status(200).json({ success: true, message: "Page saved.", data: page });
  } catch (error) {
    sendError(res, error);
  }
};
