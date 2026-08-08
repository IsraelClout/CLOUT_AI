/*

 CLOUT AI — API CLIENT


 Created by:
 Gokah Israel Ewoenam

 Handles:
 - NVIDIA streaming
 - Internet source events
 - Conversation history
 - AbortController
 - API health

*/

const CHAT_API_URL = "/api/chat";

/* =====================================================
   STREAM CHAT
===================================================== */
/**
 * @param {string} message
 * @param {function} onChunk - (text) called for each AI chunk
 * @param {function} onDone - () called when stream ends
 * @param {function} onError - (error) called on error
 * @param {function} onSources - (data) called with {searchedWeb, sources}
 * @param {AbortSignal|null} signal
 * @param {Array} messages - conversation history
 */
export async function streamChat(
  message,
  onChunk,
  onDone = () => {},
  onError = () => {},
  onSources = null,
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
    throw new Error("Message cannot be empty.");
  }

  if (typeof onChunk !== "function") {
    throw new Error("Streaming callback is missing.");
  }

  /* =================================================
     CLEAN HISTORY
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

  /* =================================================
     REQUEST
  ================================================= */
  let response;
  try {
    response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        message: cleanMessage,
        messages: cleanHistory
      }),
      signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Unable to connect to CLOUT.");
  }

  /* =================================================
     HTTP ERROR
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

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  /* =================================================
     PROCESS EVENT
  ================================================= */
  function processEvent(eventBlock) {
    const lines = eventBlock.split(/\r?\n/);
    let eventName = "message";
    let dataText = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      }
      if (line.startsWith("data:")) {
        dataText += line.slice(5).trim();
      }
    }

    if (!dataText) return;

    try {
      const data = JSON.parse(dataText);

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
          // ignore unknown events
          break;
      }
    } catch (e) {
      console.warn("Failed to parse SSE data:", dataText);
    }
  }

  /* =================================================
     READ STREAM
  ================================================= */
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) processEvent(buffer);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";

      for (const event of events) {
        if (event.trim()) processEvent(event);
      }
    }
  } catch (error) {
    if (error.name!== "AbortError") {
      onError(error.message);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/* =====================================================
   API HEALTH
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

  return await response.json();
}

/* =====================================================
   ONLINE CHECK
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
