// src/ server.js

import "dotenv/config";
import mongoose from "mongoose";
import { validateEnv } from "./config/env.js";

// Refuse to start with a missing / weak JWT secret or other unsafe settings
validateEnv();

const { default: app } = await import("./app.js");
const { default: connectDB } = await import("./config/db.js");
const { startOrderExpiryJob } = await import("./utils/orderExpiry.js");
const { startAbandonedCartJob } = await import("./utils/abandonedCart.js");

const PORT = process.env.PORT || 7000;

// Connect to Database, then start background jobs
connectDB();
mongoose.connection.once("open", () => {
  startOrderExpiryJob();
  startAbandonedCartJob(); // only runs when ABANDONED_CART_EMAILS=1
});

// Start Server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
