/*

                       CLOUT AI
                       api.js


Frontend API manager.

Handles:
✓ CLOUT chat requests
✓ Streaming responses
✓ Conversation context
✓ Internet/web source data
✓ API health checks
✓ HTTP errors
✓ JSON errors
✓ Network errors
✓ AbortController support
✓ Vercel deployment
✓ No Python
✓ No API keys in frontend

IMPORTANT:
API keys must NEVER be placed in this file.

Your secret keys stay inside:
Vercel Environment Variables

Frontend:
app.js
   ↓
api.js
   ↓
/api/chat
   ↓
Vercel
   ↓
NVIDIA + Tavily

*/

/* =====================================================
                    CONFIGURATION
===================================================== */
const API_ENDPOINT = "/api/chat";
const HEALTH_ENDPOINT = "/api/chat";

/* =====================================================
                    CUSTOM ERROR
===================================================== */
class CLOUTAPIError extends Error {
  constructor(message, status = 0, code = "API_ERROR") {
    super(message);
    this.name = "CLOUTAPIError";
    this.status = status;
    this.code = code;
  }
}

/* =====================================================
                    SEND CHAT
===================================================== */
/**
 * @param {string} message - User message
 * @param {function} onChunk - (text) called for each AI chunk
 * @param {function} onDone - () called when stream ends
 * @param {function} onError - (error) called on error
 * @param {function} onSources - (data) called with {searchedWeb, sources}
 * @param {AbortSignal|null} signal
 * @param {Array} conversation - previous messages
 */
export async function streamChat(
  message,
  onChunk,
  onDone = () => {},
  onError = () => {},
  onSources = null,
  signal = null,
  conversation = []
) {
  // 1. VALIDATE
  if (typeof message!== "string" ||!message.trim()) {
    throw new CLOUTAPIError("Please enter a message.", 400, "EMPTY_MESSAGE");
  }

  const body = {
    message: message.trim(),
    messages: normalizeConversation(conversation)
  };

  let response;

  // 2. SEND REQUEST
  try {
    response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify(body),
      signal: signal || undefined
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new CLOUTAPIError("Unable to connect to CLOUT AI. Check your internet.", 0, "NETWORK_ERROR");
  }

  // 3. HTTP ERROR
  if (!response.ok) {
    const errorText = await safelyReadResponse(response);
    throw createHTTPError(response.status, errorText);
  }

  if (!response.body) {
    throw new CLOUTAPIError("The AI server returned an empty response.", 502, "EMPTY_RESPONSE");
  }

  // 4. READ STREAM
  await readResponseStream(response, onChunk, onDone, onError, onSources);
}

/* =====================================================
                READ RESPONSE STREAM
===================================================== */
async function readResponseStream(response, onChunk, onDone, onError, onSources) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) processEventBlock(buffer, onChunk, onDone, onError, onSources);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";

      for (const eventBlock of events) {
        if (eventBlock.trim()) processEventBlock(eventBlock, onChunk, onDone, onError, onSources);
      }
    }
  } catch (error) {
    if (error.name!== "AbortError") onError(error.message);
    throw error;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/* =====================================================
              PROCESS EVENT BLOCK
===================================================== */
function processEventBlock(eventBlock, onChunk, onDone, onError, onSources) {
  const lines = eventBlock.split(/\r?\n/);
  let eventName = "message";
  let dataText = "";

  for (const line of lines) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataText += line.slice(5).trim();
  }

  if (!dataText) return;

  let data;
  try {
    data = JSON.parse(dataText);
  } catch {
    // Fallback: treat as plain text delta
    if (typeof onChunk === "function") onChunk(dataText);
    return;
  }

  // Backend error
  if (data.error) {
    onError(typeof data.error === "string"? data.error : data.error.message || "AI provider error.");
    return;
  }

  switch (eventName) {
    case "sources":
      onSources?.(data);
      break;

    case "delta":
      if (typeof data?.delta === "string" && data.delta.length > 0) {
        onChunk(data.delta);
      }
      break;

    case "done":
      onDone();
      break;

    case "error":
      onError(data?.error || "Unknown error");
      break;

    default:
      // ignore
      break;
  }
}

/* =====================================================
                NORMALIZE CONVERSATION
===================================================== */
function normalizeConversation(conversation) {
  if (!Array.isArray(conversation)) return [];
  return conversation
   .filter(m => m && (m.role === "user" || m.role === "assistant" || m.role === "system") && typeof m.content === "string")
   .slice(-12)
   .map(m => ({
      role: m.role,
      content: m.content.trim().slice(0, 8000)
    }))
   .filter(m => m.content.length);
}

/* =====================================================
                    CHECK API
===================================================== */
export async function checkAPI() {
  try {
    const response = await fetch(HEALTH_ENDPOINT, {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return { status: "online", online: true,...data };
    }

    return { status: "offline", online: false, httpStatus: response.status };
  } catch {
    return { status: "offline", online: false };
  }
}

/* =====================================================
              SAFE RESPONSE READER
===================================================== */
async function safelyReadResponse(response) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await response.json();
      return JSON.stringify(json);
    }
    return await response.text();
  } catch {
    return "";
  }
}

/* =====================================================
                  HTTP ERROR
===================================================== */
function createHTTPError(status, details) {
  const messages = {
    400: "Invalid request. Please check your message.",
    401: "AI provider authentication failed. Check the server API key.",
    403: "The AI provider rejected this request.",
    404: "CLOUT API endpoint was not found.",
    408: "The AI request timed out.",
    429: "Too many requests. Please wait a moment and try again.",
    500: "CLOUT server error.",
    502: "The AI provider returned an invalid response.",
    503: "CLOUT AI is temporarily unavailable.",
    504: "The AI provider took too long to respond."
  };

  let message = messages[status] || "CLOUT AI request failed.";
  const cleaned = extractBackendError(details);
  if (cleaned && status >= 400) message += ` ${cleaned}`;

  return new CLOUTAPIError(message, status, `HTTP_${status}`);
}

/* =====================================================
              BACKEND ERROR EXTRACTION
===================================================== */
function extractBackendError(details) {
  if (!details) return "";
  try {
    const data = JSON.parse(details);
    if (typeof data.error === "string") return data.error;
    if (data.error?.message) return data.error.message;
    if (typeof data.message === "string") return data.message;
  } catch {}
  const text = String(details).replace(/\s+/g, " ").trim();
  return text.length > 250? text.slice(0, 250) + "..." : text;
}

/* =====================================================
                  API INFORMATION
===================================================== */
export function getAPIConfig() {
  return {
    endpoint: API_ENDPOINT,
    healthEndpoint: HEALTH_ENDPOINT,
    streaming: true,
    pythonRequired: false,
    apiKeysInFrontend: false
  };
}

/* =====================================================
                    DEFAULT EXPORT
===================================================== */
export default {
  streamChat,
  checkAPI,
  getAPIConfig
};
