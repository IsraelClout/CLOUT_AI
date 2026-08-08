/*

                    CLOUT AI BACKEND
                       api/chat.js


Vercel Serverless Function

Features:
✓ NVIDIA AI Streaming
✓ Tavily Internet search
✓ Conversation memory
✓ CORS
✓ GET health check
✓ POST chat
✓ Error handling
✓ API key protection

*/

/* =====================================================
                    CONFIGURATION
===================================================== */
const CONFIG = {
  NVIDIA_API_URL: "https://integrate.api.nvidia.com/v1/chat/completions",
  TAVILY_API_URL: "https://api.tavily.com/search",
  DEFAULT_MODEL: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
  MAX_MESSAGES: 12,
  MAX_MESSAGE_LENGTH: 8000,
  MAX_SEARCH_RESULTS: 5,
  REQUEST_TIMEOUT: 60000
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

  // OPTIONS
  if (req.method === "OPTIONS") return res.status(204).end();

  // GET - HEALTH CHECK
  if (req.method === "GET") {
    return res.status(200).json({
      status: "online",
      service: "CLOUT AI",
      provider: "NVIDIA",
      model: CONFIG.DEFAULT_MODEL,
      internetSearch: Boolean(process.env.TAVILY_API_KEY),
      streaming: true,
      timestamp: new Date().toISOString()
    });
  }

  // POST ONLY
  if (req.method!== "POST") {
    return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
  }

  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

  if (!NVIDIA_API_KEY) {
    return res.status(500).json({ error: "Server configuration error. NVIDIA API key is missing.", code: "NVIDIA_KEY_MISSING" });
  }

  // 1. READ + VALIDATE REQUEST
  const { message, messages = [] } = req.body || {};
  if (typeof message!== "string" ||!message.trim()) {
    return res.status(400).json({ error: "Message is required.", code: "MESSAGE_REQUIRED" });
  }
  if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message too long. Maximum ${CONFIG.MAX_MESSAGE_LENGTH} characters.`, code: "MESSAGE_TOO_LONG" });
  }

  const history = normalizeConversation(messages);

  // 2. INTERNET SEARCH
  let webResults = [];
  let searchedWeb = false;
  if (shouldUseInternet(message) && TAVILY_API_KEY) {
    try {
      webResults = await searchInternet(message, TAVILY_API_KEY);
      searchedWeb = webResults.length > 0;
    } catch (error) {
      console.error("Tavily error:", error.message);
    }
  }

  // 3. BUILD MESSAGES
  const systemPrompt = buildSystemPrompt(webResults);
  const nvidiaMessages = [
    { role: "system", content: systemPrompt },
  ...history,
    { role: "user", content: message }
  ];

  // 4. SET SSE HEADERS
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send sources first
  if (searchedWeb) {
    writeSSE(res, "sources", {
      searchedWeb: true,
      sources: webResults.map(r => ({
        title: r.title,
        url: r.url,
        domain: getDomain(r.url)
      }))
    });
  }

  // 5. NVIDIA REQUEST
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

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
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1024,
        stream: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!nvidiaResponse.ok ||!nvidiaResponse.body) {
      const errorText = await safeText(nvidiaResponse);
      throw new Error(`NVIDIA ${nvidiaResponse.status}: ${errorText}`);
    }

    await pipeNVIDIAStream(nvidiaResponse, res);
    writeSSE(res, "done", { success: true });
    res.end();

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("NVIDIA error:", error);
    if (!res.writableEnded) {
      writeSSE(res, "error", { error: error.name === "AbortError"? "Request timed out" : "AI service error" });
      res.end();
    }
  }
}

/* =====================================================
              INTERNET SEARCH DECISION
===================================================== */
function shouldUseInternet(message) {
  const text = message.toLowerCase();
  const keywords = ["latest", "today", "now", "current", "recent", "news", "weather", "price", "score", "who is", "what happened", "2026", "search"];
  return keywords.some(term => text.includes(term));
}

/* =====================================================
                  TAVILY SEARCH
===================================================== */
async function searchInternet(query, apiKey) {
  const response = await fetch(CONFIG.TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: CONFIG.MAX_SEARCH_RESULTS,
      include_answer: true
    })
  });

  if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`);
  const data = await response.json();
  
  return (data.results || []).slice(0, CONFIG.MAX_SEARCH_RESULTS).map(r => ({
    title: r.title || "Web source",
    url: r.url || "",
    content: r.content || ""
  })).filter(r => isValidURL(r.url));
}

/* =====================================================
                SYSTEM PROMPT
===================================================== */
function buildSystemPrompt(webResults) {
  let prompt = `You are CLOUT AI, created by Gokah Israel Ewoenam. Be helpful, accurate, and conversational.
If internet search results are provided, use them to answer and cite sources like [1] [2].
Do not invent facts or sources.`;

  if (webResults.length) {
    prompt += `\n\nINTERNET SEARCH RESULTS:\n`;
    webResults.forEach((r, i) => {
      prompt += `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}\n\n`;
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

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const text = json?.choices?.[0]?.delta?.content;
        if (text) writeSSE(res, "delta", { delta: text });
      } catch {}
    }
  }
}

/* =====================================================
                    SSE WRITER
===================================================== */
function writeSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* =====================================================
              NORMALIZE CONVERSATION
===================================================== */
function normalizeConversation(conversation) {
  if (!Array.isArray(conversation)) return [];
  return conversation
   .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
   .slice(-CONFIG.MAX_MESSAGES)
   .map(m => ({ role: m.role, content: m.content.trim().slice(0, CONFIG.MAX_MESSAGE_LENGTH) }))
   .filter(m => m.content);
}

/* =====================================================
                  UTILS
===================================================== */
async function safeText(response) {
  try { return await response.text(); } catch { return ""; }
}

function isValidURL(value) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}

function getDomain(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; }
}
