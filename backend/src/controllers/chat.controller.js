/**
 * chat.controller.js
 *
 * POST /api/v1/chat   body: { messages: [{ role: "user" | "assistant", content }] }
 *
 * Answers a shopper's question with Groq (OpenAI-compatible chat completions)
 * and streams the reply back as server-sent events:
 *   data: {"delta":"text"}   (many)
 *   data: {"done":true}      (last)
 *   data: {"error":"..."}    (if the model call fails midway)
 *
 * Environment:
 *   GROQ_API_KEY   required
 *   GROQ_MODEL     optional, default llama-3.3-70b-versatile
 *   GROQ_API_BASE  optional, default https://api.groq.com/openai/v1
 */

import { buildSystemPrompt } from "../utils/chatContext.js";

const MAX_MESSAGES = 12; // how much of the conversation the model sees
const MAX_CHARS = 1000; // per message
const MAX_REPLY_TOKENS = 600;

const model = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const apiBase = () => (process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1").replace(/\/$/, "");

function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const messages = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content)
    .slice(-MAX_MESSAGES);
  // must start and end on the customer's turn
  while (messages.length && messages[0].role !== "user") messages.shift();
  return messages.length && messages[messages.length - 1].role === "user" ? messages : null;
}

export const chat = async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ success: false, message: "The chat assistant is not set up yet." });
  }

  const messages = cleanMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ success: false, message: "Send a question to ask." });
  }

  // Stop the model call if the shopper closes the page
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  let upstream;
  try {
    const system = await buildSystemPrompt(messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content));

    upstream = await fetch(`${apiBase()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model(),
        messages: [{ role: "system", content: system }, ...messages],
        temperature: 0.4,
        max_tokens: MAX_REPLY_TOKENS,
        stream: true,
      }),
      signal: abort.signal,
    });
  } catch (err) {
    if (abort.signal.aborted) return;
    console.error("chat: could not reach Groq:", err.message);
    return res.status(502).json({ success: false, message: "The assistant could not be reached. Please try again." });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error(`chat: Groq answered ${upstream.status}: ${detail.slice(0, 300)}`);
    if (upstream.status === 429)
      return res.status(429).json({ success: false, message: "The assistant is busy right now. Please try again in a moment." });
    if (upstream.status === 401 || upstream.status === 403)
      return res.status(503).json({ success: false, message: "The chat assistant is not set up correctly." });
    return res.status(502).json({ success: false, message: "The assistant could not answer. Please try again." });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // tell proxies not to hold the stream back
  });
  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if (typeof res.flush === "function") res.flush(); // compression() buffers otherwise
  };

  try {
    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });

      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) send({ delta });
        } catch {
          /* a partial or non-JSON line: skip it */
        }
      }
    }
    send({ done: true });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error("chat stream error:", err.message);
      send({ error: "The reply was interrupted. Please try again." });
    }
  } finally {
    res.end();
  }
};
