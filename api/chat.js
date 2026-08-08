/*

 CLOUT AI
 NVIDIA NIM INTERNET API


 Created by:
 Gokah Israel Ewoenam

 18 years old
 Ghanaian
 Ewe
 Akatsi, Volta Region, Ghana

 API key is stored securely in Vercel Environment Variables.
 NEVER put the API key in this file.

*/

const CONFIG = {
  NVIDIA_API_URL: "https://integrate.api.nvidia.com/v1/chat/completions",
  NVIDIA_MODEL: "meta/llama-3.1-70b-instruct",
  MAX_TOKENS: 256,
  TIMEOUT_MS: 45000
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
  res.setHeader("Access-Control-Max-Age", "86400");
}

/* =====================================================
   SYSTEM PROMPT
   ===================================================== */
function getSystemPrompt() {
  return `You are CLOUT AI, an Internet-powered AI assistant.

Your creator is: ${CREATOR.name}
Creator details: ${CREATOR.age} years old, ${CREATOR.nationality}, ${CREATOR.ethnicOrigin} from ${CREATOR.hometown}, ${CREATOR.region}, ${CREATOR.country}.

If a user asks who created CLOUT AI, answer that it was created by ${CREATOR.name}.
Be helpful, clear, accurate and respectful. Do not claim to be human.`;
}

/* =====================================================
   API HANDLER
   ===================================================== */
export default async function handler(req, res) {
  setCors(res);

  // OPTIONS - Preflight
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

  try {
    // 1. Check API Key
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "Server configuration error: NVIDIA_API_KEY is missing."
      });
    }

    // 2. Validate Message
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

    // 3. Call NVIDIA NIM with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

    const nvidiaRes = await fetch(CONFIG.NVIDIA_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
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
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await nvidiaRes.json().catch(() => ({}));

    // 4. Handle NVIDIA Errors
    if (!nvidiaRes.ok) {
      console.error("NVIDIA API ERROR:", nvidiaRes.status, data);
      return res.status(502).json({
        success: false,
        error: data.error?.message || `NVIDIA API error: ${nvidiaRes.status} ${nvidiaRes.statusText}`,
        providerStatus: nvidiaRes.status
      });
    }

    // 5. Extract AI Response
    const answer = data.choices?.[0]?.message?.content;
    if (!answer) {
      console.error("Empty response from NVIDIA:", data);
      return res.status(502).json({
        success: false,
        error: "NVIDIA returned an empty response."
      });
    }

    // 6. Success
    return res.status(200).json({
      success: true,
      response: answer,
      mode: "internet",
      provider: "NVIDIA NIM",
      model: CONFIG.NVIDIA_MODEL,
      usage: data.usage || null,
      creator: CREATOR.name
    });

  } catch (error) {
    console.error("CLOUT SERVER ERROR:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        error: "Request timed out. NVIDIA AI took too long to respond."
      });
    }

    return res.status(500).json({
      success: false,
      error: "CLOUT could not connect to NVIDIA AI service."
    });
  }
}
