/* =========================================================
   CLOUT AI
   INTERNET API CLIENT v2
   Created by Gokah Israel Ewoenam
   ========================================================= */

/* =========================================================
   API CONFIGURATION
   ========================================================= */
const API_CONFIG = {
  chatEndpoint: "/api/chat",
  healthEndpoint: "/api/health",
  timeoutMs: 45000 // 45s timeout for LLM responses
};

/* =========================================================
   CREATOR
   ========================================================= */
const API_CREATOR = {
  name: "Gokah Israel Ewoenam",
  age: 18,
  nationality: "Ghanaian",
  ethnicOrigin: "Ewe",
  hometown: "Akatsi",
  region: "Volta Region",
  country: "Ghana"
};

/* =========================================================
   HELPERS
   ========================================================= */
function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

function formatError(message) {
  return {
    success: false,
    error: message
  };
}

/* =========================================================
   SEND CHAT REQUEST
   ========================================================= */
async function sendToCLOUT(message) {
  // Input validation
  if (typeof message !== "string") {
    return formatError("Message must be text.");
  }

  const cleanMessage = message.trim();
  if (!cleanMessage) {
    return formatError("Message cannot be empty.");
  }

  if (cleanMessage.length > 4000) {
    return formatError("Message is too long. Max 4000 characters.");
  }

  const { signal, clear } = createTimeoutSignal(API_CONFIG.timeoutMs);

  try {
    const response = await fetch(API_CONFIG.chatEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        message: cleanMessage,
        mode: "internet",
        project: "CLOUT AI",
        creator: API_CREATOR.name,
        timestamp: new Date().toISOString()
      }),
      signal
    });

    clear();

    let data;
    try {
      data = await response.json();
    } catch {
      return formatError("The server returned an invalid JSON response.");
    }

    if (!response.ok) {
      return formatError(
        data?.error || `The CLOUT API returned an error: ${response.status} ${response.statusText}`
      );
    }

    // Normalize response
    return {
      success: true,
      response: data.response || data.message || data.reply || "",
      mode: data.mode || "internet",
      source: data.source || "Internet AI",
      usage: data.usage || null
    };

  } catch (error) {
    clear();
    console.error("CLOUT API ERROR:", error);

    if (error.name === "AbortError") {
      return formatError("Request timed out. The AI is taking too long to respond.");
    }
    if (error.name === "TypeError") {
      return formatError("Unable to connect to the CLOUT Internet API. Check your internet connection.");
    }
    
    return formatError("An unexpected error occurred while contacting CLOUT.");
  }
}

/* =========================================================
   HEALTH CHECK
   ========================================================= */
async function checkCLOUTHealth() {
  const { signal, clear } = createTimeoutSignal(8000); // 8s timeout for health

  try {
    const response = await fetch(API_CONFIG.healthEndpoint, { signal });
    clear();
    
    const data = await response.json().catch(() => ({}));
    
    return {
      online: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    clear();
    return {
      online: false,
      error: error.name === "AbortError" ? "Health check timed out" : error.message
    };
  }
}

/* =========================================================
   PROJECT INFORMATION
   ========================================================= */
function getCLOUTInfo() {
  return {
    name: "CLOUT AI",
    type: "Internet AI",
    storage: "None",
    version: "1.0.0",
    creator: API_CREATOR.name,
    creatorDetails: `${API_CREATOR.age} years old, ${API_CREATOR.nationality}, ${API_CREATOR.ethnicOrigin}, from ${API_CREATOR.hometown}, ${API_CREATOR.region}, ${API_CREATOR.country}.`
  };
}

/* =========================================================
   PUBLIC CLOUT API
   ========================================================= */
const CLOUT_API = {
  chat: sendToCLOUT,
  health: checkCLOUTHealth,
  info: getCLOUTInfo,
  config: Object.freeze({ ...API_CONFIG })
};

/* =========================================================
   GLOBAL ACCESS
   ========================================================= */
if (typeof window !== "undefined") {
  window.CLOUT_API = CLOUT_API;
}

/* =========================================================
   STARTUP LOG
   ========================================================= */
console.group("CLOUT AI - Internet Client");
console.log("Creator:", API_CREATOR.name);
console.log("Mode:", "Internet AI");
console.log("Storage:", "None");
console.log("Endpoints:", API_CONFIG);
console.groupEnd();
