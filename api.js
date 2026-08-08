/*

 CLOUT AI — FRONTEND API CLIENT


 Created by:
 Gokah Israel Ewoenam

 Architecture:
 index.html -> app.js -> api.js -> /api/chat.js -> Tavily + NVIDIA -> Stream

 Features:
 - NVIDIA AI
 - Tavily Internet search
 - Streaming responses
 - Conversation history
 - Abort/Stop generation
 - API health check
 - No localStorage
 - No API keys in frontend
 - No Python

*/

/* =====================================================
   API CONFIGURATION
===================================================== */
const CHAT_API_URL = "/api/chat";

/* =====================================================
   STREAM CLOUT RESPONSE
===================================================== */
/**
 * Sends a message to CLOUT and receives
 * the NVIDIA response as a stream.
 *
 * @param {string} message
 * @param {function} onChunk - called for each text chunk
 * @param {function} onDone - called when stream finishes
 * @param {function} onError - called on error
 * @param {AbortSignal|null} signal - for aborting
 * @param {Array} messages - conversation history
 * @returns {Promise<void>}
 */
export async function streamChat(
  message,
  onChunk,
  onDone = () => {},
  onError = () => {},
  signal = null,
  messages = []
) {
  /* =================================================
     VALIDATE INPUTS
  ================================================= */
  if (typeof message !== "string") {
    throw new Error("Message must be text.");
  }

  const cleanMessage = message.trim();
  if (!cleanMessage) {
    throw new Error("Please enter a message.");
  }

  if (typeof onChunk !== "function") {
    throw new Error("Streaming callback is missing.");
  }

  /* =================================================
     CLEAN CONVERSATION HISTORY
  ================================================= */
  const cleanHistory = Array.isArray(messages)
   ? messages
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-12)
      .map(m => ({
        role: m.role,
        content: m.content.trim().slice(0, 8000)
      }))
    : [];

  const requestBody = {
    message: cleanMessage,
    messages: cleanHistory
  };

  /* =================================================
     SEND REQUEST
  ================================================= */
  let response;
  try {
    response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify(requestBody),
      signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Unable to connect to CLOUT.");
  }

  /* =================================================
     CHECK HTTP RESPONSE
  ================================================= */
  if (!response.ok) {
    let errorMessage = `Server error: ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) errorMessage = data.error;
    } catch {}
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("The CLOUT server did not return a stream.");
  }

  /* =================================================
     READ STREAM
  ================================================= */
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        processBuffer(true);
        onDone();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      processBuffer(false);
    }
  } catch (error) {
    if (error.name!== "AbortError") {
      onError(error.message);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  /* =================================================
     PROCESS SSE BUFFER
  ================================================= */
  function processBuffer(finalChunk = false) {
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = finalChunk ? "" : events.pop() || "";

    for (const event of events) {
      const lines = event.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Handle event types from server
        if (trimmed.startsWith("event: done")) {
          onDone();
          return;
        }
        if (trimmed.startsWith("event: error")) continue; // error will be in next data line

        if (!trimmed.startsWith("data:")) continue;

        const dataText = trimmed.slice(5).trim();
        if (!dataText || dataText === "[DONE]") continue;

        try {
          const data = JSON.parse(dataText);
          
          // New format: { delta: "text" }
          if (typeof data?.delta === "string" && data.delta.length > 0) {
            onChunk(data.delta);
          }
          
          // Error format: { error: "message" }
          if (typeof data?.error === "string") {
            throw new Error(data.error);
          }
        } catch (e) {
          if (e.message!== "Unexpected token") {
            console.debug("Skipped malformed SSE chunk:", dataText);
          }
        }
      }
    }
  }
}

/* =====================================================
   API HEALTH CHECK
===================================================== */
export async function checkAPI() {
  let response;
  try {
    response = await fetch(CHAT_API_URL, {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });
  } catch {
    throw new Error("CLOUT server is unreachable.");
  }

  if (!response.ok) {
    throw new Error(`API health check failed: ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error("Invalid response from CLOUT server.");
  }
}

/* =====================================================
   API STATUS HELPER
===================================================== */
export async function isAPIOnline() {
  try {
    const data = await checkAPI();
    return data?.status === "online";
  } catch {
    return false;
  }
}

/* =====================================================
   DEFAULT EXPORT
===================================================== */
export default {
  streamChat,
  checkAPI,
  isAPIOnline
};
