/*

 CLOUT AI — CONVERSATION MEMORY FRONTEND


 No localStorage.
 No Python.
 No database.

 Conversation exists only while this page
 is open.

 Created by:
 Gokah Israel Ewoenam

*/

import { streamChat, checkAPI } from "./api.js";

/* =====================================================
   DOM ELEMENTS
===================================================== */
const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const chatMessages = document.querySelector("#chat-messages");
const sendButton = document.querySelector("#send-button");
const stopButton = document.querySelector("#stop-button");
const statusElement = document.querySelector("#connection-status");

/* =====================================================
   STATE
===================================================== */
let controller = null;
let isGenerating = false;

/*
Conversation memory.
This is NOT localStorage.
Refreshing the page clears it.
*/
let conversation = [];

/* =====================================================
   CONNECTION STATUS
===================================================== */
async function updateConnectionStatus() {
  if (!statusElement) return;

  try {
    const data = await checkAPI();
    if (data?.status === "online") {
      statusElement.textContent = "● Online";
      statusElement.className = "connection-status online";
    } else {
      statusElement.textContent = "● Offline";
      statusElement.className = "connection-status offline";
    }
  } catch {
    statusElement.textContent = "● Offline";
    statusElement.className = "connection-status offline";
  }
}

/* =====================================================
   UI HELPERS
===================================================== */
function createMessage(type) {
  const message = document.createElement("div");
  message.className = `message ${type}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  
  message.appendChild(bubble);
  chatMessages.appendChild(message);
  scrollToBottom();
  
  return bubble;
}

function scrollToBottom() {
  chatMessages?.scrollTo({
    top: chatMessages.scrollHeight,
    behavior: "smooth"
  });
}

function createTypingIndicator() {
  const typing = document.createElement("div");
  typing.className = "message assistant typing-message";
  typing.innerHTML = `
    <div class="message-bubble typing">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  chatMessages.appendChild(typing);
  scrollToBottom();
  return typing;
}

function removeTyping(typing) {
  typing?.remove();
}

function setGenerating(state) {
  isGenerating = state;
  if (sendButton) sendButton.disabled = state;
  if (messageInput) messageInput.disabled = state;
  if (stopButton) stopButton.hidden = !state;
}

/* =====================================================
   SEND MESSAGE
===================================================== */
async function sendMessage() {
  if (isGenerating) return;

  const message = messageInput.value.trim();
  if (!message) return;

  // 1. Show + Save User Message
  createMessage("user").textContent = message;
  conversation.push({ role: "user", content: message });
  
  // Keep only last 12 messages for token limits
  if (conversation.length > 12) {
    conversation = conversation.slice(-12);
  }

  messageInput.value = "";
  messageInput.style.height = "auto";

  // 2. Create AI Message + Typing
  const aiBubble = createMessage("assistant");
  aiBubble.classList.add("streaming");
  const typing = createTypingIndicator();

  // 3. Start Request
  controller = new AbortController();
  setGenerating(true);
  let fullResponse = "";
  let firstChunk = true;

  try {
    await streamChat(
      message,
      // onChunk
      (chunk) => {
        if (firstChunk) {
          removeTyping(typing);
          firstChunk = false;
        }
        fullResponse += chunk;
        aiBubble.textContent = fullResponse;
        scrollToBottom();
      },
      // onDone
      () => {
        aiBubble.classList.remove("streaming");
        if (!fullResponse) {
          aiBubble.textContent = "No response was returned.";
        } else {
          // Save assistant response to memory
          conversation.push({ role: "assistant", content: fullResponse });
          if (conversation.length > 12) {
            conversation = conversation.slice(-12);
          }
        }
      },
      // onError
      (error) => {
        removeTyping(typing);
        aiBubble.textContent = `⚠️ ${error}`;
        aiBubble.classList.add("error");
      },
      // signal
      controller.signal
    );

  } catch (error) {
    // AbortError is handled in api.js
    if (error.name!== "AbortError") {
      console.error("CLOUT FATAL ERROR:", error);
    }
  } finally {
    controller = null;
    setGenerating(false);
    scrollToBottom();
    messageInput.focus();
  }
}

/* =====================================================
   STOP GENERATION
===================================================== */
function stopGeneration() {
  controller?.abort();
  controller = null;
}

/* =====================================================
   EVENT LISTENERS
===================================================== */
chatForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});

stopButton?.addEventListener("click", stopGeneration);

messageInput?.addEventListener("keydown", (e) => {
  // Enter to send, Shift+Enter for newline
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!isGenerating) sendMessage();
  }
});

/* =====================================================
   INITIALIZE
===================================================== */
updateConnectionStatus();
setInterval(updateConnectionStatus, 30000);

console.log("CLOUT AI: Conversation memory enabled. Max 12 messages.");
