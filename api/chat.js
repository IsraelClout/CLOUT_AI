/*

                    CLOUT AI
                 MISTRAL BACKEND


Vercel Serverless Function

✓ Mistral AI
✓ Streaming
✓ Conversation memory
✓ CORS
✓ Health check
✓ Timeout protection
✓ Fast responses
✓ No Python

*/

/* =====================================================
                    CONFIGURATION
===================================================== */
const CONFIG = {
  API_URL: "https://api.mistral.ai/v1/chat/completions",
  MODEL: process.env.MISTRAL_MODEL || "mistral-large-latest",
  MAX_MESSAGES: 8,
  MAX_MESSAGE_LENGTH: 6000,
  MAX_TOKENS: 700,
  TIMEOUT: 30000
};

/* =====================================================
                         CORS
===================================================== */
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/* =====================================================
                    MAIN HANDLER
===================================================== */
export default async function handler(req, res) {
  setCORS(res);

  /* OPTIONS */
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  /* HEALTH CHECK */
  if (req.method === "GET") {
    return res.status(200).json({
      status: "online",
      service: "CLOUT AI",
      provider: "Mistral",
      model: CONFIG.MODEL,
      streaming: true,
      fastMode: true,
      timestamp: new Date().toISOString()
    });
  }

  /* POST ONLY */
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
      code: "METHOD_NOT_ALLOWED"
    });
  }

  /* API KEY */
  const API_KEY = process.env.MISTRAL_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: "Mistral API key is missing.",
      code: "MISTRAL_KEY_MISSING"
    });
  }

  /* REQUEST BODY */
  const body = req.body || {};
  const message = typeof body.message === "string"? body.message.trim() : "";
  const history = normalizeConversation(body.messages);

  /* VALIDATION */
  if (!message) {
    return res.status(400).json({
      error: "Message is required.",
      code: "MESSAGE_REQUIRED"
    });
  }

  if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Message too long. Maximum ${CONFIG.MAX_MESSAGE_LENGTH} characters.`,
      code: "MESSAGE_TOO_LONG"
    });
  }

  /* AI MESSAGES */
  const messages = [
    {
      role: "system",
      content: `You are CLOUT AI, created by Gokah Israel Ewoenam.

Be helpful, intelligent, accurate and conversational.
Answer the user's question directly.
Keep normal answers reasonably concise.
Do not claim to have Internet access unless a real web-search tool is connected.
When writing code, provide clean and working code.`
    },
   ...history,
    { role: "user", content: message }
  ];

  /* SSE HEADERS */
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  /* START EVENT */
  sendEvent(res, "start", { success: true, provider: "Mistral" });

  /* TIMEOUT */
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

  try {
    /* MISTRAL REQUEST */
    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        messages,
        temperature: 0.6,
        max_tokens: CONFIG.MAX_TOKENS,
        stream: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    /* MISTRAL ERROR */
    if (!response.ok) {
      const errorText = await safeText(response);
      console.error("Mistral error:", response.status, errorText);

      sendEvent(res, "error", {
        error: `Mistral API error: ${response.status}`,
        code: "MISTRAL_API_ERROR"
      });

      return res.end();
    }

    if (!response.body) {
      sendEvent(res, "error", {
        error: "Mistral returned no response.",
        code: "EMPTY_RESPONSE"
      });
      return res.end();
    }

    /* STREAM MISTRAL */
    await streamMistral(response, res);

    /* DONE */
    if (!res.writableEnded) {
      sendEvent(res, "done", { success: true });
      res.end();
    }

  } catch (error) {
    clearTimeout(timeout);
    console.error("Mistral request error:", error);

    if (!res.writableEnded) {
      if (error.name === "AbortError") {
        sendEvent(res, "error", {
          error: "Mistral request timed out.",
          code: "MISTRAL_TIMEOUT"
        });
      } else {
        sendEvent(res, "error", {
          error: "Could not connect to Mistral.",
          code: "MISTRAL_CONNECTION_ERROR"
        });
      }
      res.end();
    }
  }
}

/* =====================================================
                  STREAM MISTRAL
===================================================== */
async function streamMistral(response, res) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const text = json?.choices?.[0]?.delta?.content;
        if (text) {
          sendEvent(res, "delta", { delta: text });
        }
      } catch {
        // Ignore incomplete streaming chunks
      }
    }
  }
}

/* =====================================================
                    SSE EVENT
===================================================== */
function sendEvent(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/* =====================================================
                CONVERSATION MEMORY
===================================================== */
function normalizeConversation(conversation) {
  if (!Array.isArray(conversation)) return [];

  return conversation
   .filter(
      item =>
        item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
    )
   .slice(-CONFIG.MAX_MESSAGES)
   .map(item => ({
      role: item.role,
      content: item.content.trim().slice(0, CONFIG.MAX_MESSAGE_LENGTH)
    }))
   .filter(item => item.content);
}

/* =====================================================
                       UTILITIES
===================================================== */
async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
