/*

                    CLOUT AI
              COMPLETE FRONTEND APP


Creator:
Gokah Israel Ewoenam

Features:
✓ NVIDIA AI streaming
✓ Tavily Internet search
✓ Web source cards
✓ Conversation memory
✓ New Chat
✓ Clear Chat
✓ Copy AI response
✓ Stop generation
✓ Regenerate response
✓ Enter to send
✓ Shift + Enter for newline
✓ Auto-resizing input
✓ Connection status
✓ Loading indicator
✓ Error handling
✓ Mobile friendly
✓ No localStorage
✓ No Python
✓ No API keys exposed

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
const connectionStatus = document.querySelector("#connection-status");

/* =====================================================
                    APPLICATION STATE
===================================================== */
let conversation = [];
let controller = null;
let isGenerating = false;
let lastUserMessage = "";
let currentAIMessage = null;

/* =====================================================
                 CREATOR INFORMATION
===================================================== */
const CLOUT_CREATOR = {
  name: "Gokah Israel Ewoenam",
  age: 18,
  nationality: "Ghanaian",
  ethnicOrigin: "Ewe",
  hometown: "Akatsi",
  region: "Volta Region",
  country: "Ghana"
};

/* =====================================================
                    INITIALIZE
===================================================== */
document.addEventListener("DOMContentLoaded", initializeCLOUT);

function initializeCLOUT() {
  createControlBar();
  setupForm();
  setupInput();
  setupStopButton();
  updateConnectionStatus();
  setInterval(updateConnectionStatus, 30000);
  messageInput?.focus();
}

/* =====================================================
                  CONTROL BAR
===================================================== */
function createControlBar() {
  if (document.querySelector("#clout-controls")) return;

  const controls = document.createElement("div");
  controls.id = "clout-controls";
  controls.innerHTML = `
    <button id="new-chat-button" type="button">＋ New Chat</button>
    <button id="clear-chat-button" type="button">🗑 Clear</button>
  `;

  if (chatForm) chatForm.parentNode.insertBefore(controls, chatForm);
  else if (chatMessages) chatMessages.parentNode.insertBefore(controls, chatMessages);

  document.querySelector("#new-chat-button")?.addEventListener("click", startNewChat);
  document.querySelector("#clear-chat-button")?.addEventListener("click", clearChat);
}

/* =====================================================
                    FORM SETUP
===================================================== */
function setupForm() {
  chatForm?.addEventListener("submit", e => {
    e.preventDefault();
    sendMessage();
  });
}

/* =====================================================
                    INPUT SETUP
===================================================== */
function setupInput() {
  messageInput?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating) sendMessage();
    }
  });
  messageInput?.addEventListener("input", resizeInput);
}

function resizeInput() {
  if (!messageInput) return;
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
}

/* =====================================================
                   STOP BUTTON
===================================================== */
function setupStopButton() {
  if (!stopButton) return;
  stopButton.addEventListener("click", stopGeneration);
  stopButton.hidden = true;
}

/* =====================================================
                CONNECTION STATUS
===================================================== */
async function updateConnectionStatus() {
  if (!connectionStatus) return;
  connectionStatus.textContent = "● Connecting...";
  connectionStatus.className = "connection-status";

  try {
    const data = await checkAPI();
    connectionStatus.textContent = data?.status === "online" ? "● Online" : "● Offline";
    connectionStatus.classList.add(data?.status === "online" ? "online" : "offline");
  } catch {
    connectionStatus.textContent = "● Offline";
    connectionStatus.classList.add("offline");
  }
}

/* =====================================================
                   SEND MESSAGE
===================================================== */
async function sendMessage(customMessage = null) {
  if (isGenerating) return;

  const message = (typeof customMessage === "string" ? customMessage : messageInput.value).trim();
  if (!message) return;

  lastUserMessage = message;

  // USER MESSAGE
  const userMessage = createMessage("user");
  userMessage.bubble.textContent = message;
  conversation.push({ role: "user", content: message });
  trimConversation();

  messageInput.value = "";
  messageInput.style.height = "auto";

  // AI MESSAGE
  const aiMessage = createMessage("assistant");
  currentAIMessage = aiMessage;
  aiMessage.bubble.classList.add("streaming");
  const typing = createTypingIndicator();

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
        removeTyping(typing);
        aiMessage.bubble.classList.remove("streaming");
        if (!fullResponse.trim()) {
          aiMessage.bubble.textContent = "I couldn't generate a response.";
        } else {
          conversation.push({ role: "assistant", content: fullResponse });
          trimConversation();
          addCopyButton(aiMessage.message, fullResponse);
          addRegenerateButton(aiMessage.message);
        }
      },
      // onError
      (error) => {
        removeTyping(typing);
        aiMessage.bubble.textContent = `⚠️ ${error}`;
        addRetryButton(aiMessage.message);
      },
      // onSources
      (sourceData) => {
        if (sourceData?.searchedWeb && Array.isArray(sourceData.sources)) {
          addSourceCards(aiMessage.message, sourceData.sources);
        }
      },
      // signal
      controller.signal,
      // history
      conversation
    );

  } catch (error) {
    if (error.name === "AbortError") {
      if (fullResponse.trim()) {
        conversation.push({ role: "assistant", content: fullResponse });
        trimConversation();
      } else {
        aiMessage.bubble.textContent = "Generation stopped.";
      }
    }
  } finally {
    controller = null;
    currentAIMessage = null;
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
                  GENERATION STATE
===================================================== */
function setGenerating(state) {
  isGenerating = state;
  if (sendButton) sendButton.disabled = state;
  if (stopButton) stopButton.hidden = !state;
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
  chatMessages?.appendChild(message);
  scrollToBottom();
  return { message, bubble };
}

/* =====================================================
                  TYPING INDICATOR
===================================================== */
function createTypingIndicator() {
  const typing = document.createElement("div");
  typing.className = "message assistant typing-message";
  typing.innerHTML = `<div class="message-bubble typing"><span></span><span></span><span></span></div>`;
  chatMessages?.appendChild(typing);
  scrollToBottom();
  return typing;
}

function removeTyping(typing) {
  typing?.remove();
}

/* =====================================================
                    COPY BUTTON
===================================================== */
function addCopyButton(messageElement, text) {
  if (messageElement.querySelector(".copy-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-button";
  button.textContent = "📋 Copy";
  button.addEventListener("click", async () => {
    try {
      await copyText(text);
      button.textContent = "✓ Copied";
      setTimeout(() => { button.textContent = "📋 Copy"; }, 1500);
    } catch {
      button.textContent = "Copy failed";
      setTimeout(() => { button.textContent = "📋 Copy"; }, 1500);
    }
  });
  messageElement.appendChild(button);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

/* =====================================================
                  SOURCE CARDS
===================================================== */
function addSourceCards(messageElement, sources) {
  if (!Array.isArray(sources) || !sources.length) return;
  messageElement.querySelector(".clout-sources")?.remove();

  const container = document.createElement("div");
  container.className = "clout-sources";
  container.innerHTML = `<div class="sources-heading">🌐 Web Sources</div>`;

  sources.forEach(source => {
    if (!source?.url) return;
    try {
      const safeURL = new URL(source.url);
      if (safeURL.protocol !== "http:" && safeURL.protocol !== "https:") return;
      
      const link = document.createElement("a");
      link.className = "source-card";
      link.href = safeURL.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.innerHTML = `
        <div class="source-title">${source.title || "Web source"}</div>
        <div class="source-domain">${source.domain || safeURL.hostname}</div>
      `;
      container.appendChild(link);
    } catch {}
  });

  if (container.querySelector(".source-card")) {
    messageElement.appendChild(container);
  }
}

/* =====================================================
                  REGENERATE BUTTON
===================================================== */
function addRegenerateButton(messageElement) {
  if (messageElement.querySelector(".regenerate-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "regenerate-button";
  button.textContent = "↻ Regenerate";
  button.addEventListener("click", regenerate);
  messageElement.appendChild(button);
}

function regenerate() {
  if (isGenerating || !lastUserMessage) return;
  if (conversation[conversation.length - 1]?.role === "assistant") conversation.pop();
  chatMessages?.querySelector(".message.assistant:last-of-type")?.remove();
  sendRegeneratedMessage();
}

async function sendRegeneratedMessage() {
  await sendMessage(lastUserMessage);
}

/* =====================================================
                    RETRY BUTTON
===================================================== */
function addRetryButton(messageElement) {
  if (messageElement.querySelector(".retry-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "retry-button";
  button.textContent = "↻ Try again";
  button.addEventListener("click", () => {
    messageElement.remove();
    sendRegeneratedMessage();
  });
  messageElement.appendChild(button);
}

/* =====================================================
                 TRIM CONVERSATION
===================================================== */
function trimConversation() {
  if (conversation.length > 12) conversation = conversation.slice(-12);
}

/* =====================================================
                    NEW CHAT
===================================================== */
function startNewChat() {
  controller?.abort();
  controller = null;
  conversation = [];
  lastUserMessage = "";
  currentAIMessage = null;
  chatMessages.innerHTML = "";
  setGenerating(false);
  messageInput.value = "";
  messageInput.style.height = "auto";
  messageInput.focus();
}

function clearChat() {
  if (conversation.length === 0) return;
  if (!window.confirm("Clear this conversation?")) return;
  startNewChat();
}

/* =====================================================
                    SCROLL
===================================================== */
function scrollToBottom() {
  chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
}

/* =====================================================
                    PAGE EXIT
===================================================== */
window.addEventListener("beforeunload", () => controller?.abort());

/* =====================================================
                 DEBUG INFORMATION
===================================================== */
window.CLOUT = {
  creator: CLOUT_CREATOR,
  getConversation: () => [...conversation],
  clearChat: startNewChat,
  stop: stopGeneration,
  isGenerating: () => isGenerating
};

console.log("CLOUT AI initialized successfully.");
console.log("Creator:", CLOUT_CREATOR.name);
