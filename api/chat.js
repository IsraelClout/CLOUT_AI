/*

                    CLOUT AI BACKEND
                       api/chat.js

Fast Vercel Serverless API

✓ NVIDIA AI
✓ Fast streaming
✓ Optional Tavily search
✓ Conversation memory
✓ CORS
✓ Health check
✓ Timeout protection

*/

/* =====================================================
                    CONFIGURATION
===================================================== */
const CONFIG = {
  NVIDIA_API_URL: "https://integrate.api.nvidia.com/v1/chat/completions",
  TAVILY_API_URL: "https://api.tavily.com/search",
  DEFAULT_MODEL: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
  MAX_MESSAGES: 8,
  MAX_MESSAGE_LENGTH: 6000,
  MAX_SEARCH_RESULTS: 3,
  NVIDIA_TIMEOUT: 25000,
  TAVILY_TIMEOUT: 5000,
  MAX_TOKENS: 700
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
      provider: "NVIDIA",
      model: CONFIG.DEFAULT_MODEL,
      internetSearch: Boolean(process.env.TAVILY_API_KEY),
      streaming: true,
      fastMode: true,
      timestamp: new Date().toISOString()
    });
  }

  /* POST ONLY */
  if (req.method!== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
      code: "METHOD_NOT_ALLOWED"
    });
  }

  /* API KEYS */
  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

  if (!NVIDIA_API_KEY) {
    return res.status(500).json({
      error: "NVIDIA API key is missing.",
      code: "NVIDIA_KEY_MISSING"
    });
  }

  /* READ REQUEST */
  const body = req.body || {};
  const message = typeof body.message === "string"? body.message.trim() : "";
  const messages = Array.isArray(body.messages)? body.messages : [];

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

  /* CONVERSATION HISTORY */
  const history = normalizeConversation(messages);

  /* SSE HEADERS */
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  writeSSE(res, "start", { success: true, provider: "NVIDIA" });

  /* OPTIONAL INTERNET SEARCH */
  let webResults = [];
  const useInternet = shouldUseInternet(message);

  if (useInternet && TAVILY_API_KEY) {
    try {
      webResults = await searchInternetFast(message, TAVILY_API_KEY);
      if (webResults.length) {
        writeSSE(res, "sources", {
          searchedWeb: true,
          sources: webResults.map(result => ({
            title: result.title,
            url: result.url,
            domain: getDomain(result.url)
          }))
        });
      }
    } catch (error) {
      console.error("Tavily skipped:", error.message);
    }
  }

  /* SYSTEM PROMPT */
  const systemPrompt = buildSystemPrompt(webResults);

  /* NVIDIA MESSAGES */
  const nvidiaMessages = [
    { role: "system", content: systemPrompt },
   ...history,
    { role: "user", content: message }
  ];

  /* NVIDIA REQUEST */
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.NVIDIA_TIMEOUT);

  try {
    const nvidiaResponse = await fetch(CONFIG.NVIDIA_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        model: CONFIG.DEFAULT_MODEL,
        messages: nvidiaMessages,
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: CONFIG.MAX_TOKENS,
        stream: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    /* NVIDIA ERROR */
    if (!nvidiaResponse.ok) {
      const errorText = await safeText(nvidiaResponse);
      console.error("NVIDIA API:", nvidiaResponse.status, errorText);
      writeSSE(res, "error", {
        error: `NVIDIA API error (${nvidiaResponse.status}).`,
        code: "NVIDIA_API_ERROR"
      });
      return res.end();
    }

    if (!nvidiaResponse.body) {
      writeSSE(res, "error", {
        error: "NVIDIA returned an empty response.",
        code: "EMPTY_RESPONSE"
      });
      return res.end();
    }

    /* STREAM RESPONSE */
    await pipeNVIDIAStream(nvidiaResponse, res);

    /* DONE */
    if (!res.writableEnded) {
      writeSSE(res, "done", { success: true });
      res.end();
    }

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("NVIDIA request failed:", error);

    if (!res.writableEnded) {
      if (error.name === "AbortError") {
        writeSSE(res, "error", {
          error: "The AI request took too long. Please try again.",
          code: "NVIDIA_TIMEOUT"
        });
      } else {
        writeSSE(res, "error", {
          error: "Unable to connect to the AI service.",
          code: "NVIDIA_CONNECTION_ERROR"
        });
      }
      res.end();
    }
  }
}

/* =====================================================
                INTERNET SEARCH DECISION
===================================================== */
function shouldUseInternet(message) {
  const text = message.toLowerCase();
  const keywords = [
    "latest", "today", "now", "current", "recent", "news", "weather",
    "price", "prices", "score", "scores", "who is", "what happened",
    "2026", "search", "internet", "online"
  ];
  return keywords.some(keyword => text.includes(keyword));
}

/* =====================================================
                 FAST TAVILY SEARCH
===================================================== */
async function searchInternetFast(query, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TAVILY_TIMEOUT);

  try {
    const response = await fetch(CONFIG.TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: CONFIG.MAX_SEARCH_RESULTS,
        include_answer: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Tavily HTTP ${response.status}`);
    }

    const data = await response.json();

    return (data.results || [])
     .slice(0, CONFIG.MAX_SEARCH_RESULTS)
     .map(result => ({
        title: result.title || "Web source",
        url: result.url || "",
        content: (result.content || "").slice(0, 1800)
      }))
     .filter(result => isValidURL(result.url));

  } finally {
    clearTimeout(timeoutId);
  }
}

/* =====================================================
                    SYSTEM PROMPT
===================================================== */
function buildSystemPrompt(webResults) {
  let prompt = `You are CLOUT AI, created by Gokah Israel Ewoenam.

Be helpful, accurate, concise, and conversational.
Answer directly without unnecessary introductions.
If Internet search results are provided, use them when relevant.
Do not invent facts, URLs, or sources.
When sources are provided, cite them using [1], [2], etc.`;

  if (webResults.length) {
    prompt += "\n\nINTERNET SEARCH RESULTS:\n";
    webResults.forEach((result, index) => {
      prompt += `\n[${index + 1}] ${result.title}\nURL: ${result.url}\n${result.content}\n`;
    });
  }

  return prompt;
}

/* =====================================================
                 STREAM NVIDIA RESPONSE
===================================================== */
async function pipeNVIDIAStream(response, res) {
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
          writeSSE(res, "delta", { delta: text });
        }
      } catch {
        // Ignore malformed streaming chunks
      }
    }
  }
}

/* =====================================================
                     SSE WRITER
===================================================== */
function writeSSE(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/* =====================================================
              NORMALIZE CONVERSATION
===================================================== */
function normalizeConversation(conversation) {
  if (!Array.isArray(conversation)) return [];

  return conversation
   .filter(
      message =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
    )
   .slice(-CONFIG.MAX_MESSAGES)
   .map(message => ({
      role: message.role,
      content: message.content.trim().slice(0, CONFIG.MAX_MESSAGE_LENGTH)
    }))
   .filter(message => message.content);
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

function isValidURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
