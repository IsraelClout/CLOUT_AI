/*

 CLOUT AI — INTERNET + SOURCES + NVIDIA STREAMING


 Created by:
 Gokah Israel Ewoenam

 Features:
 - NVIDIA Llama
 - Tavily Internet search
 - Live source cards
 - Streaming AI responses
 - Conversation context
 - No Python
 - No localStorage
 - No exposed API keys

*/

const CONFIG = {
  NVIDIA_API_URL: "https://integrate.api.nvidia.com/v1/chat/completions",
  TAVILY_API_URL: "https://api.tavily.com/search",
  NVIDIA_MODEL: "meta/llama-3.1-70b-instruct",
  MAX_TOKENS: 1024,
  MAX_HISTORY: 12,
  TIMEOUT_MS: 60000
};

const CREATOR = {
  name: "Gokah Israel Ewoenam",
  age: 18,
  nationality: "Ghanaian",
  ethnicOrigin: "Ewe",
  hometown: "Akatsi",
  region: "Volta Region",
  country: "Ghana"
};

/* =====================================================
   CORS
===================================================== */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/* =====================================================
   SEARCH DETECTION
===================================================== */
function needsWebSearch(message) {
  const text = message.toLowerCase();
  const keywords = [
    "latest", "today", "current", "right now", "recent", "news", "breaking",
    "this week", "this month", "this year", "who won", "score", "scores",
    "weather", "price", "prices", "stock", "stocks", "exchange rate",
    "currency rate", "president", "election", "released", "release date",
    "2026", "search the internet", "search online", "look it up", "what happened"
  ];
  return keywords.some(keyword => text.includes(keyword));
}

/* =====================================================
   TAVILY SEARCH
===================================================== */
async function searchWeb(query) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is missing.");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(CONFIG.TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
        include_images: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      console.error("TAVILY ERROR:", error);
      throw new Error(`Web search failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/* =====================================================
   EXTRACT SAFE SOURCE DATA
===================================================== */
function getSources(searchData) {
  const results = searchData?.results || [];
  return results
  .slice(0, 5)
  .map(result => {
      let url = result.url || "";
      if (!/^https?:\/\//i.test(url)) url = "";
      return {
        title: String(result.title || "Web source").slice(0, 200),
        url,
        domain: getDomain(url)
      };
    })
  .filter(source => source.url);
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/* =====================================================
   FORMAT SEARCH CONTEXT
===================================================== */
function formatSearchResults(searchData) {
  const results = searchData?.results || [];
  const answer = searchData?.answer;

  if (!results.length &&!answer) {
    return "No useful web results were found.";
  }

  let output = "";
  if (answer) {
    output += `TAVILY SUMMARY:\n${answer}\n\n`;
  }

  output += "SOURCES:\n";
  output += results.slice(0, 5).map((item, index) =>
    `[${index + 1}] ${item.title || "Untitled"}\nURL: ${item.url || "No URL"}\nSummary: ${item.content || "No content"}`
  ).join("\n\n");

  return output.trim();
}

/* =====================================================
   CLEAN HISTORY
===================================================== */
function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
  .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
  .slice(-CONFIG.MAX_HISTORY)
  .map(m => ({
      role: m.role,
      content: m.content.trim().slice(0, 8000)
    }));
}

/* =====================================================
   SEND SSE EVENT
===================================================== */
function sendEvent(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* =====================================================
   SYSTEM PROMPT
===================================================== */
function getSystemPrompt() {
  return `You are CLOUT AI, an AI assistant powered by NVIDIA NIM.

Your creator is: ${CREATOR.name}
Creator details: ${CREATOR.age} years old, ${CREATOR.nationality}, ${CREATOR.ethnicOrigin} from ${CREATOR.hometown}, ${CREATOR.region}, ${CREATOR.country}.

If asked who created CLOUT AI, identify ${CREATOR.name} as the creator.
Be helpful, accurate, clear and conversational. Use previous conversation messages when understanding references.

When live web search results are supplied:
- Prefer current information from those results and cite sources like [1] [2]
- Do not invent facts or sources.
- If information is uncertain, say so.`;
}

/* =====================================================
   MAIN HANDLER
===================================================== */
export default async function handler(req, res) {
  setCors(res);

  // OPTIONS
  if (req.method === "OPTIONS") return res.status(200).end();

  // GET - HEALTH CHECK
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      status: "online",
      service: "CLOUT AI",
      provider: "NVIDIA NIM",
      model: CONFIG.NVIDIA_MODEL,
      streaming: true,
      internetSearch: Boolean(process.env.TAVILY_API_KEY),
      sources: true,
      conversationMemory: true,
      nvidiaConfigured: Boolean(process.env.NVIDIA_API_KEY),
      creator: CREATOR.name
    });
  }

  // POST ONLY
  if (req.method!== "POST") {
    return res.status(405).json({ success: false, error: "Only POST requests are allowed." });
  }

  const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
  if (!NVIDIA_KEY) {
    return res.status(500).json({ success: false, error: "NVIDIA_API_KEY is missing." });
  }

  const { message, messages = [] } = req.body || {};
  if (typeof message!== "string" ||!message.trim()) {
    return res.status(400).json({ success: false, error: "Message must be text." });
  }

  const cleanMessage = message.trim();
  if (cleanMessage.length > 4000) {
    return res.status(400).json({ success: false, error: "Message too long. Maximum 4000 characters." });
  }

  // Set SSE headers immediately
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const history = cleanMessages(messages);
    let webContext = "";
    let sources = [];
    let searchedWeb = false;

    // 1. WEB SEARCH
    if (needsWebSearch(cleanMessage)) {
      try {
        searchedWeb = true;
        const searchData = await searchWeb(cleanMessage);
        webContext = formatSearchResults(searchData);
        sources = getSources(searchData);
      } catch (error) {
        console.error("WEB SEARCH ERROR:", error);
        webContext = "Live web search was unavailable.";
        sources = [];
      }
    }

    // Send sources to frontend BEFORE AI starts streaming
    sendEvent(res, "sources", { searchedWeb, sources });

    // 2. BUILD MESSAGES
    let currentContent = cleanMessage;
    if (searchedWeb) {
      currentContent = `USER QUESTION:\n${cleanMessage}\n\nLIVE WEB SEARCH RESULTS:\n${webContext}\n\nUse the search results to answer. Cite sources like [1] [2]`;
    }

    const aiMessages = [
      { role: "system", content: getSystemPrompt() },
    ...history,
      { role: "user", content: currentContent }
    ];

    // 3. NVIDIA REQUEST
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

    const response = await fetch(CONFIG.NVIDIA_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NVIDIA_KEY}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        model: CONFIG.NVIDIA_MODEL,
        messages: aiMessages,
        temperature: 0.6,
        max_tokens: CONFIG.MAX_TOKENS,
        stream: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok ||!response.body) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("NVIDIA ERROR:", response.status, errorText);
      sendEvent(res, "error", { error: `NVIDIA API error: ${response.status}` });
      return res.end();
    }

    // 4. STREAM + PARSE NVIDIA
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            sendEvent(res, "delta", { delta });
          }
        } catch (e) {
          console.warn("Failed to parse NVIDIA chunk:", data);
        }
      }
    }

    sendEvent(res, "done", { success: true });
    res.end();

  } catch (error) {
    console.error("CLOUT ERROR:", error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: "CLOUT could not connect to NVIDIA." });
    }
    sendEvent(res, "error", { error: error.message });
    res.end();
  }
}
