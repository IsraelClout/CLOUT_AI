/*

 CLOUT AI — STREAMING CHAT FRONTEND


 Created by:
 Gokah Israel Ewoenam

 18 years old
 Ghanaian
 Ewe
 Akatsi, Volta Region, Ghana

 Features:
 - NVIDIA AI streaming
 - Stop generation
 - Loading state
 - Error handling
 - Mobile first
 - No localStorage

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

/* =====================================================
   INIT CHECKS
   ===================================================== */
if (!chatForm || !messageInput || !chatMessages) {
  console.error("CLOUT: Missing required DOM elements. Check IDs: #chat-form, #message-input, #chat-messages");
}

/* =====================================================
   CONNECTION STATUS
   ===================================================== */
async function updateConnectionStatus() {
  if (!statusElement) return;

  try {
    const data = await checkAPI();
    if (data?.status === "online") {
      statusElement.textContent = "● Online";
      statusElement.className = "status online";
    } else {
      statusElement.textContent = "● Offline";
      statusElement.className = "status offline";
    }
  } catch {
    statusElement.textContent = "● Offline";
    statusElement.className = "status offline";
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
  chatMessages.scrollTo({
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

  // 1. Show user message
  const userBubble = createMessage("user");
  userBubble.textContent = message;
  messageInput.value = "";

  // 2. Create AI message + typing
  const aiBubble = createMessage("assistant");
  aiBubble.classList.add("streaming");
  const typing = createTypingIndicator();

  // 3. Start request
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
          aiBubble.textContent = "CLOUT did not return a response.";
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
    // AbortError is handled in api.js, this is for unexpected errors
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

console.log(`CLOUT AI v1.1.0 initialized. Creator: ${"Gokah Israel Ewoenam"}`);
