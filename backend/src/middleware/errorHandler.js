/**
 * Global error handler.
 *
 * The full error (with stack) is logged on the server only. The client gets a
 * safe message: for 5xx errors it is always generic, so internal details
 * (database messages, file paths, library errors) never leak.
 */
export default (err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Body-parser errors: malformed JSON, body too large
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON in request body." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Request body is too large." });
  }

  // Multer (file upload) errors are the uploader's mistake
  if (err.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large."
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Too many files, or an unexpected file field."
          : "The upload was rejected.";
    return res.status(400).json({ success: false, message });
  }

  const statusCode = err.statusCode || err.status || 500;

  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err.stack || err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }

  // 4xx errors raised on purpose by our own code carry a client-safe message
  return res.status(statusCode).json({
    success: false,
    message: err.expose === false ? "Request failed." : err.message || "Request failed.",
  });
};
