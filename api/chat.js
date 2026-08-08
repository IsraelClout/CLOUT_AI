/*

 CLOUT AI — NVIDIA STREAMING API


 Created by:
 Gokah Israel Ewoenam

 18 years old
 Ghanaian
 Ewe
 Akatsi, Volta Region, Ghana

 API key: Stored securely in Vercel environment variables.
 NEVER place the NVIDIA API key in this file.

*/

const CONFIG = {
  NVIDIA_API_URL: "https://integrate.api.nvidia.com/v1/chat/completions",
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
   SYSTEM PROMPT
   ===================================================== */
function getSystemPrompt() {
  return `You are CLOUT AI, an Internet-powered AI assistant.
Your creator is: ${CREATOR.name}
Creator details: ${CREATOR.age} years old, ${CREATOR.nationality}, ${CREATOR.ethnicOrigin} from ${CREATOR.hometown}, ${CREATOR.region}, ${CREATOR.country}.

If someone asks who created CLOUT AI, say that it was created by ${CREATOR.name}.
Be helpful, accurate, clear and respectful. Do not claim to be human.`;
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
      apiConfigured: Boolean(process.env.NVIDIA_API_KEY),
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

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "Server configuration error: NVIDIA_API_KEY is missing."
    });
  }

  const { message } = req.body || {};
  if (typeof message!== "string" || !message.trim()) {
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

  // Set SSE headers before calling NVIDIA
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    const nvidiaRes = await fetch(CONFIG.NVIDIA_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        model: CONFIG.NVIDIA_MODEL,
        messages: [
          { role: "system", content: getSystemPrompt() },
          { role: "user", content: cleanMessage }
        ],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: CONFIG.MAX_TOKENS,
        stream: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!nvidiaRes.ok || !nvidiaRes.body) {
      const errorText = await nvidiaRes.text().catch(() => "Unknown error");
      console.error("NVIDIA ERROR:", nvidiaRes.status, errorText);
      res.write(`event: error\ndata: ${JSON.stringify({ error: `NVIDIA API error: ${nvidiaRes.status}` })}\n\n`);
      return res.end();
    }

    const reader = nvidiaRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line

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
            // Forward only the text delta to frontend
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch (e) {
          // Skip malformed JSON chunk
          console.warn("Failed to parse NVIDIA chunk:", data);
        }
      }
    }

    res.end();

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("CLOUT STREAM ERROR:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: "CLOUT could not connect to NVIDIA."
      });
    }
    
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}
