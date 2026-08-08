/*

 CLOUT AI — NVIDIA + INTERNET SEARCH


 Created by:
 Gokah Israel Ewoenam

 18 years old
 Ghanaian
 Ewe
 Akatsi, Volta Region, Ghana

 Providers:
 - NVIDIA NIM
 - Tavily Web Search

 API keys:
 Stored securely in Vercel Environment Variables.

 NEVER put API keys in frontend files.

*/

const CONFIG = {
  NVIDIA_API_URL: "https://integrate.api.nvidia.com/v1/chat/completions",
  TAVILY_API_URL: "https://api.tavily.com/search",
  NVIDIA_MODEL: "meta/llama-3.1-70b-instruct",
  MAX_TOKENS: 1024,
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
   DECIDE WHETHER WEB SEARCH IS NEEDED
===================================================== */
function needsWebSearch(message) {
  const text = message.toLowerCase();
  const webKeywords = [
    "latest", "today", "current", "right now", "this week", "this month", "this year",
    "recent", "news", "breaking", "who won", "who is winning", "score", "scores",
    "weather", "price", "prices", "stock", "stocks", "exchange rate", "currency rate",
    "president", "election", "release date", "released", "2026",
    "search the internet", "search online", "look it up", "what happened"
  ];
  return webKeywords.some(keyword => text.includes(keyword));
}

/* =====================================================
   SEARCH TAVILY
===================================================== */
async function searchWeb(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is missing.");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(CONFIG.TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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
   FORMAT SEARCH RESULTS
===================================================== */
function formatSearchResults(searchData) {
  const results = searchData?.results || [];
  const answer = searchData?.answer;

  if (!results.length &&!answer) {
    return "No useful web results were found.";
  }

  let output = "";
  if (answer) {
    output += `TAVILY AI ANSWER:\n${answer}\n\n`;
  }

  output += "SOURCES:\n";
  output += results.map((result, index) => `
[${index + 1}] ${result.title || "Untitled"}
URL: ${result.url || "No URL"}
Summary: ${result.content || "No content"}`).join("\n\n");

  return output.trim();
}

/* =====================================================
   SYSTEM PROMPT
===================================================== */
function getSystemPrompt() {
  return `You are CLOUT AI, an Internet-capable AI assistant powered by NVIDIA NIM.

Your creator is: ${CREATOR.name}
Creator details: ${CREATOR.age} years old, ${CREATOR.nationality}, ${CREATOR.ethnicOrigin} from ${CREATOR.hometown}, ${CREATOR.region}, ${CREATOR.country}.

If someone asks who created CLOUT AI, say that it was created by ${CREATOR.name}.
Be helpful, accurate, clear and respectful. Do not claim to be human.

When web search results are provided:
1. Prefer the web information for current facts and cite sources like [1] or [2].
2. Do not invent information that isn't supported by the sources.
3. If sources disagree, explain the disagreement.
4. If no web results are provided, answer using your model knowledge.`;
}

/* =====================================================
   API HANDLER
===================================================== */
export default async function handler(req, res) {
  setCors(res);

  // OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET - Health Check
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      status: "online",
      service: "CLOUT AI",
      provider: "NVIDIA NIM",
      model: CONFIG.NVIDIA_MODEL,
      streaming: true,
      internetSearch: Boolean(process.env.TAVILY_API_KEY),
      nvidiaConfigured: Boolean(process.env.NVIDIA_API_KEY),
      creator: CREATOR.name
    });
  }

  // POST ONLY
  if (req.method!== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed. Only GET and POST are supported."
    });
  }

  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) {
    return res.status(500).json({
      success: false,
      error: "Server configuration error: NVIDIA_API_KEY is missing."
    });
  }

  const { message } = req.body || {};
  if (typeof message!== "string" ||!message.trim()) {
    return res.status(400).json({
      success: false,
      error: "Please provide a message."
    });
  }

  const cleanMessage = message.trim();
  if (cleanMessage.length > 4000) {
    return res.status(400).json({
      success: false,
      error: "Message too long. Maximum 4000 characters."
    });
  }

  // Set SSE headers before any async work
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let webContext = "";
  let searchedWeb = false;

  try {
    // 1. Web Search if needed
    if (needsWebSearch(cleanMessage)) {
      searchedWeb = true;
      try {
        const searchData = await searchWeb(cleanMessage);
        webContext = formatSearchResults(searchData);
      } catch (error) {
        console.error("WEB SEARCH ERROR:", error);
        webContext = "Web search was unavailable for this request.";
      }
    }

    // 2. Build user content with context
    const userContent = searchedWeb
     ? `USER QUESTION:\n${cleanMessage}\n\nLIVE WEB SEARCH RESULTS:\n${webContext}\n\nUse the information above to answer the user's question accurately. Cite sources with [1], [2] etc.`
      : cleanMessage;

    // 3. Call NVIDIA with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

    const nvidiaRes = await fetch(CONFIG.NVIDIA_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${nvidiaKey}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        model: CONFIG.NVIDIA_MODEL,
        messages: [
          { role: "system", content: getSystemPrompt() },
          { role: "user", content: userContent }
        ],
        temperature: 0.6,
        max_tokens: CONFIG.MAX_TOKENS,
        stream: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!nvidiaRes.ok ||!nvidiaRes.body) {
      const errorText = await nvidiaRes.text().catch(() => "Unknown error");
      console.error("NVIDIA ERROR:", nvidiaRes.status, errorText);
      res.write(`event: error\ndata: ${JSON.stringify({ error: `NVIDIA API error: ${nvidiaRes.status}` })}\n\n`);
      return res.end();
    }

    // 4. Stream and parse NVIDIA SSE
    const reader = nvidiaRes.body.getReader();
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
        if (data === "[DONE]") {
          res.write(`event: done\ndata: [DONE]\n\n`);
          res.end();
          return;
        }

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch (e) {
          console.warn("Failed to parse NVIDIA chunk:", data);
        }
      }
    }

    res.end();

  } catch (error) {
    console.error("CLOUT ERROR:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: "CLOUT could not connect to the AI service."
      });
    }

    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}
