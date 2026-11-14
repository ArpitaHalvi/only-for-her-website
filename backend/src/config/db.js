import dns from "node:dns";
import mongoose from "mongoose";

// Public resolvers used only when the machine's own DNS cannot answer the
// SRV lookup that a mongodb+srv:// (Atlas) connection string needs.
const FALLBACK_DNS = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isSrvDnsError = (error) =>
  error?.syscall === "querySrv" ||
  /querySrv|ECONNREFUSED.*_mongodb\._tcp/.test(error?.message || "");

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  try {
    await mongoose.connect(uri);
    console.log("Database is Connected");
  } catch (error) {
    // Node's resolver sometimes points at a local DNS stub (127.0.0.1 from a
    // VPN, DNS proxy or router) that refuses SRV queries even though the
    // system's own lookups work. Retry once with public DNS servers.
    if (uri?.startsWith("mongodb+srv://") && isSrvDnsError(error)) {
      console.log(
        `SRV lookup failed (${error.code || error.message}). Retrying with DNS servers ${FALLBACK_DNS.join(", ")}...`,
      );
      try {
        dns.setServers(FALLBACK_DNS);
        await mongoose.connect(uri);
        console.log("Database is Connected");
        return;
      } catch (retryError) {
        error = retryError;
      }
    }

    console.log("Database Connection Error", error.message);
    process.exit(1);
  }
};

export default connectDB;
