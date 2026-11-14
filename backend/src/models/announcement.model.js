import mongoose from "mongoose";

// A line in the strip above the header, e.g. "Free shipping above Rs 999".
const announcementSchema = new mongoose.Schema(
  {
    text: { type: String, required: [true, "Announcement text is required"], trim: true, maxlength: 200 },
    link: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || /^(\/(?!\/)|https?:\/\/)/i.test(v),
        message: 'Link must start with "/" (a page on the site) or "http(s)://".',
      },
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

announcementSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model("Announcement", announcementSchema);
