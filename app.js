/*

 CLOUT AI — FULL FRONTEND CONTROLLER


 Created by:
 Gokah Israel Ewoenam

 Features:
 - NVIDIA Llama
 - Internet search
 - Streaming responses
 - Conversation memory
 - New Chat
 - Clear Chat
 - Copy AI responses
 - Stop generation
 - Mobile friendly
 - No localStorage
 - No Python

*/

import { streamChat, checkAPI } from "./api.js";

/* =====================================================
   ELEMENTS
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
This exists only in JavaScript memory.
It is NOT localStorage.
*/
let conversation = [];

/* =====================================================
   CREATE CONTROL BAR
===================================================== */
function createControlBar() {
  if (document.querySelector("#clout-controls")) return;

  const controls = document.createElement("div");
  controls.id = "clout-controls";
  controls.innerHTML = `
    <button id="new-chat-button" type="button" title="Start a new chat">＋ New Chat</button>
    <button id="clear-chat-button" type="button" title="Clear conversation">🗑 Clear</button>
  `;

  if (chatForm) {
    chatForm.parentNode.insertBefore(controls, chatForm);
  } else if (chatMessages) {
    chatMessages.parentNode.insertBefore(controls, chatMessages);
  }

  document.querySelector("#new-chat-button")?.addEventListener("click", startNewChat);
  document.querySelector("#clear-chat-button")?.addEventListener("click", clearChat);
}

/* =====================================================
   NEW CHAT
===================================================== */
function startNewChat() {
  controller?.abort();
  controller = null;
  conversation = [];
  
  if (chatMessages) {
    chatMessages.innerHTML = "";
  }
  
  setGenerating(false);
  messageInput.value = "";
  messageInput.style.height = "auto";
  messageInput.focus();
}

/* =====================================================
   CLEAR CHAT
===================================================== */
function clearChat() {
  if (conversation.length === 0) return;
  if (!window.confirm("Clear this conversation?")) return;
  startNewChat();
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
   CREATE MESSAGE
===================================================== */
function createMessage(type) {
  const message = document.createElement("div");
  message.className = `message ${type}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  message.appendChild(bubble);
  chatMessages.appendChild(message);
  scrollToBottom();

  return { message, bubble };
}

/* =====================================================
   ADD COPY BUTTON
===================================================== */
function addCopyButton(messageElement, text) {
  if (messageElement.querySelector(".copy-button")) return;

  const button = document.createElement("button");
  button.className = "copy-button";
  button.type = "button";
  button.textContent = "📋 Copy";

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "✓ Copied";
      setTimeout(() => { button.textContent = "📋 Copy"; }, 1500);
    } catch {
      button.textContent = "Copy failed";
      setTimeout(() => { button.textContent = "📋 Copy"; }, 1500);
    }
  });

  messageElement.appendChild(button);
}

/* =====================================================
   TYPING INDICATOR
===================================================== */
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

/* =====================================================
   GENERATION STATE
===================================================== */
function setGenerating(state) {
  isGenerating = state;
  if (sendButton) sendButton.disabled = state;
  if (messageInput) messageInput.disabled = state;
  if (stopButton) stopButton.hidden = !state;
}

/* =====================================================
   SCROLL
===================================================== */
function scrollToBottom() {
  chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
}

/* =====================================================
   SEND MESSAGE
===================================================== */
async function sendMessage() {
  if (isGenerating ||!messageInput) return;

  const message = messageInput.value.trim();
  if (!message) return;

  // 1. USER MESSAGE
  const userMessage = createMessage("user");
  userMessage.bubble.textContent = message;
  conversation.push({ role: "user", content: message });
  if (conversation.length > 12) conversation = conversation.slice(-12);

  messageInput.value = "";
  messageInput.style.height = "auto";

  // 2. AI MESSAGE
  const aiMessage = createMessage("assistant");
  aiMessage.bubble.classList.add("streaming");
  const typing = createTypingIndicator();

  // 3. REQUEST
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
        aiMessage.bubble.textContent = fullResponse;
        scrollToBottom();
      },
      // onDone
      () => {
        aiMessage.bubble.classList.remove("streaming");
        if (fullResponse) {
          conversation.push({ role: "assistant", content: fullResponse });
          if (conversation.length > 12) conversation = conversation.slice(-12);
          addCopyButton(aiMessage.message, fullResponse);
        } else {
          aiMessage.bubble.textContent = "No response was returned.";
        }
      },
      // onError
      (error) => {
        removeTyping(typing);
        aiMessage.bubble.textContent = `⚠️ ${error}`;
        aiMessage.bubble.classList.add("error");
      },
      // signal
      controller.signal,
      // history
      conversation
    );

  } catch (error) {
    if (error.name!== "AbortError") console.error("CLOUT FATAL ERROR:", error);
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
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!isGenerating) sendMessage();
  }
});

messageInput?.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 150)}px`;
});

/* =====================================================
   START APPLICATION
===================================================== */
createControlBar();
updateConnectionStatus();
setInterval(updateConnectionStatus, 30000);
messageInput?.focus();

console.log("CLOUT AI: Full controller loaded. Memory + Internet + Copy enabled.");
