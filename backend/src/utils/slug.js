export const slugify = (text = "") =>
  text
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

/**
 * Returns a slug that is not used by any document in `Model`, appending
 * -2, -3, ... when needed. Soft-deleted documents still count as taken, since
 * they keep their slug in the unique index.
 */
export async function uniqueSlug(Model, text) {
  const base = slugify(text) || "item";
  let slug = base;
  let counter = 2;
  while (await Model.exists({ slug }).setOptions({ withDeleted: true })) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}
