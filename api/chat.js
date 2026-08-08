/* =========================================================
   CLOUT AI
   SERVERLESS CHAT API - NVIDIA NIM
   Created by Gokah Israel Ewoenam
   ========================================================= */

/* =========================================================
   CREATOR
   ========================================================= */
const CREATOR = {
  name: "Gokah Israel Ewoenam",
  age: 18,
  nationality: "Ghanaian",
  ethnicOrigin: "Ewe",
  hometown: "Akatsi",
  region: "Volta Region",
  country: "Ghana"
};

/* =========================================================
   CONFIG
   ========================================================= */
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "meta/llama-3.1-8b-instruct"; // Fast + free tier
const MAX_TOKENS = 1024;

/* =========================================================
   CORS
   ========================================================= */
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

/* =========================================================
   VALIDATION
   ========================================================= */
function validateRequest(body) {
  if (!body || typeof body!== "object") {
    return "Invalid request body.";
  }
  if (typeof body.message!== "string") {
    return "Message must be text.";
  }
  const message = body.message.trim();
  if (!message) {
    return "Message cannot be empty.";
  }
  if (message.length > 4000) {
    return "Message is too long. Max 4000 characters.";
  }
  return null;
}

/* =========================================================
   CALL NVIDIA NIM
   ========================================================= */
async function callNvidiaNIM(userMessage) {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is not set in environment variables.");
  }

  const payload = {
    model: DEFAULT_MODEL,
    messages: [
      {
        role: "system",
        content: "You are CLOUT AI, a helpful internet-powered assistant created by Gokah Israel Ewoenam. Be friendly, concise, and accurate."
      },
      {
        role: "user",
        content: userMessage
      }
    ],
    max_tokens: MAX_TOKENS,
    temperature: 0.7,
    top_p: 1.0,
    stream: false
  };

  const response = await fetch(NVIDIA_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `NVIDIA API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const aiMessage = data.choices?.[0]?.message?.content;

  if (!aiMessage) {
    throw new Error("NVIDIA returned an empty response.");
  }

  return {
    text: aiMessage,
    usage: data.usage || null,
    model: data.model || DEFAULT_MODEL
  };
}

/* =========================================================
   API HANDLER
   ========================================================= */
export default async function handler(req, res) {
  setCORS(res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only POST allowed
  if (req.method!== "POST") {
    return res.status(405).json({
      success: false,
      error: "Only POST requests are supported."
    });
  }

  try {
    // Validate
    const validationError = validateRequest(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError
      });
    }

    const userMessage = req.body.message.trim();

    // Call Nvidia
    const result = await callNvidiaNIM(userMessage);

    // Success response
    return res.status(200).json({
      success: true,
      response: result.text,
      mode: "internet",
      source: "NVIDIA NIM",
      model: result.model,
      usage: result.usage,
      creator: CREATOR.name
    });

  } catch (error) {
    console.error("CLOUT API ERROR:", error);

    // Don't leak stack trace to client
    const message = error.message.includes("NVIDIA_API_KEY")
     ? "Server configuration error. Please contact support."
      : error.message;

    return res.status(500).json({
      success: false,
      error: message
    });
  }
}
