/* =========================================================
   CLOUT AI
   SERVERLESS API - NVIDIA NIM PROXY
   Created by Gokah Israel Ewoenam
   ========================================================= */

const CREATOR = "Gokah Israel Ewoenam";

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "meta/llama-3.1-8b-instruct"; // Fast, free tier. Change if needed

export default async function handler(req, res) {
  // =========================================================
  // CORS HEADERS
  // =========================================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  // =========================================================
  // PREFLIGHT
  // =========================================================
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // =========================================================
  // METHOD CHECK
  // =========================================================
  if (req.method!== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed. Only POST requests are supported."
    });
  }

  try {
    // =========================================================
    // INPUT VALIDATION
    // =========================================================
    const { message } = req.body || {};

    if (typeof message!== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid request. 'message' must be a string."
      });
    }

    const cleanMessage = message.trim();

    if (cleanMessage.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Please enter a message."
      });
    }

    if (cleanMessage.length > 4000) {
      return res.status(400).json({
        success: false,
        error: "Message too long. Maximum 4000 characters."
      });
    }

    // =========================================================
    // CHECK API KEY
    // =========================================================
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      console.error("NVIDIA_API_KEY is not set");
      return res.status(500).json({
        success: false,
        error: "Server configuration error. API key missing."
      });
    }

    // =========================================================
    // CALL NVIDIA NIM
    // =========================================================
    const nvidiaResponse = await fetch(NVIDIA_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are CLOUT AI, a helpful assistant created by ${CREATOR}. Be friendly, concise, and accurate.`
          },
          {
            role: "user",
            content: cleanMessage
          }
        ],
        max_tokens: 1024,
        temperature: 0.7,
        stream: false
      })
    });

    if (!nvidiaResponse.ok) {
      const errorBody = await nvidiaResponse.json().catch(() => ({}));
      console.error("NVIDIA API Error:", errorBody);
      return res.status(nvidiaResponse.status).json({
        success: false,
        error: errorBody.message || "Failed to get response from AI provider."
      });
    }

    const data = await nvidiaResponse.json();
    const aiText = data.choices?.[0]?.message?.content;

    if (!aiText) {
      return res.status(500).json({
        success: false,
        error: "AI returned an empty response."
      });
    }

    // =========================================================
    // SUCCESS RESPONSE
    // =========================================================
    return res.status(200).json({
      success: true,
      response: aiText,
      mode: "internet",
      model: data.model || MODEL,
      usage: data.usage || null,
      creator: CREATOR
    });

  } catch (error) {
    console.error("CLOUT API Handler Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error. Please try again later."
    });
  }
}
