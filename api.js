/*

 CLOUT AI — STREAMING API CLIENT


 Connects the CLOUT frontend to:
 
 Frontend -> Vercel -> /api/chat -> NVIDIA API -> Stream

 No API key is stored here.

*/

/**
 * Send a message to CLOUT AI and stream
 * the response back to the frontend.
 *
 * @param {string} message
 * @param {function} onChunk - called with each text chunk: onChunk("hello")
 * @param {function} onDone - called when stream finishes: onDone()
 * @param {function} onError - called on error: onError("error message")
 * @param {AbortSignal|null} signal - for canceling the request
 * @returns {Promise<void>}
 */
export async function streamChat(
  message,
  onChunk,
  onDone = () => {},
  onError = () => {},
  signal = null
) {
  /* =================================================
     VALIDATE MESSAGE
     ================================================= */
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Please enter a message.");
  }

  const cleanMessage = message.trim();

  try {
    /* =================================================
       SEND REQUEST
       ================================================= */
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify({
        message: cleanMessage
      }),
      signal
    });

    /* =================================================
       CHECK RESPONSE
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
      throw new Error("Streaming is not supported by this browser.");
    }

    /* =================================================
       READ STREAM
       ================================================= */
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep last incomplete line

      for (const line of lines) {
        if (!line) continue;

        // Handle event types from server
        if (line.startsWith("event: error")) continue; // next line will be data
        
        if (line.startsWith("event: done")) {
          onDone();
          return;
        }

        if (line.startsWith("data: ")) {
          const dataText = line.slice(6).trim();
          
          if (dataText === "[DONE]") {
            onDone();
            return;
          }

          try {
            const data = JSON.parse(dataText);
            // Server now sends { delta: "text" }
            if (data?.delta) {
              onChunk(data.delta);
            }
            // Server can also send { error: "..." }
            if (data?.error) {
              throw new Error(data.error);
            }
          } catch (e) {
            // Skip malformed JSON chunks. Don't crash chat
            console.debug("Skipped malformed SSE chunk:", dataText);
          }
        }
      }
    }
    
    onDone(); // Stream ended naturally

  } catch (error) {
    if (error.name === "AbortError") {
      console.log("Stream aborted by user");
      return;
    }
    console.error("StreamChat Error:", error);
    onError(error.message);
    throw error; // Re-throw so app.js can catch it too
  }
}

/* =====================================================
   NON-STREAMING HEALTH CHECK
   ===================================================== */
export async function checkAPI() {
  const response = await fetch("/api/chat");
  
  if (!response.ok) {
    throw new Error(`API health check failed: ${response.status}`);
  }

  return await response.json();
}
