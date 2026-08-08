/*

 CLOUT AI - SERVERLESS INTERNET AI API v2


 Created by:
 Gokah Israel Ewoenam

 18 years old
 Ghanaian
 Ewe
 Akatsi, Volta Region, Ghana

 This file runs on the server.
 Store secrets in hosting platform environment variables.
 Never commit API keys to GitHub.

*/

/* =======================================================
   CONFIG
   ======================================================= */
const CREATOR = {
  name: "Gokah Israel Ewoenam",
  age: 18,
  nationality: "Ghanaian",
  ethnicOrigin: "Ewe",
  hometown: "Akatsi",
  region: "Volta Region",
  country: "Ghana"
};

const CLOUT = {
  name: "CLOUT AI",
  version: "1.1.0",
  type: "Internet AI",
  storage: "None"
};

const TIMEOUT_MS = 45000; // 45s timeout for LLM

/* =======================================================
   CORS
   ======================================================= */
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

/* =======================================================
   HEALTH CHECK RESPONSE
   ======================================================= */
function healthResponse(res) {
  return res.status(200).json({
    success: true,
    status: "online",
    service: CLOUT.name,
    version: CLOUT.version,
    mode: CLOUT.type,
    storage: CLOUT.storage,
    creator: CREATOR.name
  });
}

/* =======================================================
   SYSTEM PROMPT
   ======================================================= */
function getSystemPrompt() {
  return `You are ${CLOUT.name}, an Internet-powered AI assistant.

You were created by ${CREATOR.name}.
Creator details: ${CREATOR.age} years old, ${CREATOR.nationality}, ${CREATOR.ethnicOrigin} from ${CREATOR.hometown}, ${CREATOR.region}, ${CREATOR.country}.

If asked who created you, always answer: ${CREATOR.name}. Do not invent another creator.
Be helpful, accurate, clear, and respectful. Keep responses concise.`;
}

/* =======================================================
   MAIN HANDLER
   ======================================================= */
export default async function handler(req, res) {
  setCORS(res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Health check
  if (req.method === "GET") {
    return healthResponse(res);
  }

  // Only POST allowed for chat
  if (req.method!== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed. Use GET for health or POST for chat."
    });
  }

  try {
    // ===================================================
    // ENV VARS
    // ===================================================
    const API_KEY = process.env.CLOUT_AI_API_KEY;
    const API_URL = process.env.CLOUT_AI_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
    const MODEL = process.env.CLOUT_AI_MODEL || "meta/llama-3.1-8b-instruct";

    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Server configuration error: CLOUT_AI_API_KEY is missing."
      });
    }

    // ===================================================
    // VALIDATE INPUT
    // ===================================================
    const { message } = req.body || {};

    if (typeof message!== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid request: 'message' must be a string."
      });
    }

    const cleanMessage = message.trim();
    if (cleanMessage.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Message cannot be empty."
      });
    }
    if (cleanMessage.length > 4000) {
      return res.status(400).json({
        success: false,
        error: "Message too long. Maximum 4000 characters."
      });
    }

    // ===================================================
    // CALL AI PROVIDER WITH TIMEOUT
    // ===================================================
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const aiResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
        "HTTP-Referer": "https://clout-ai.vercel.app",
        "X-Title": CLOUT.name
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: getSystemPrompt() },
          { role: "user", content: cleanMessage }
        ],
        max_tokens: 1024,
        temperature: 0.7,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await aiResponse.json().catch(() => ({}));

    if (!aiResponse.ok) {
      console.error("AI PROVIDER ERROR:", aiResponse.status, data);
      return res.status(502).json({
        success: false,
        error: data.error?.message || `AI provider error: ${aiResponse.status}`
      });
    }

    // ===================================================
    // EXTRACT RESPONSE
    // ===================================================
    const answer = data.choices?.[0]?.message?.content || data.response || data.text;

    if (!answer) {
      console.error("Empty response from provider:", data);
      return res.status(502).json({
        success: false,
        error: "The AI provider returned an empty response."
      });
    }

    // ===================================================
    // SUCCESS
    // ===================================================
    return res.status(200).json({
      success: true,
      response: answer,
      mode: "internet",
      model: MODEL,
      usage: data.usage || null,
      creator: CREATOR.name
    });

  } catch (error) {
    console.error("CLOUT SERVER ERROR:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        error: "Request timed out. The AI took too long to respond."
      });
    }

    return res.status(500).json({
      success: false,
      error: "CLOUT could not connect to the Internet AI service."
    });
  }
}
