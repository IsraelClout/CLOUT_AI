/*

                      CLOUT AI
                 COMPLETE APP.JS


Creator:
Gokah Israel Ewoenam

Frontend features:
✓ NVIDIA streaming
✓ Tavily Internet search
✓ Web source cards
✓ Session conversation memory
✓ New Chat
✓ Clear Chat
✓ Copy response
✓ Regenerate response
✓ Retry failed response
✓ Stop generation
✓ Voice input
✓ Voice output
✓ Enter to send
✓ Shift + Enter for newline
✓ Auto-resizing message box
✓ Connection status
✓ Mobile friendly

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
const voiceButton = document.querySelector("#voice-button");

/* =====================================================
                    CLOUT STATE
===================================================== */
let conversation = [];
let controller = null;
let isGenerating = false;
let lastUserMessage = "";
let currentAIMessage = null;
let recognition = null;
let isListening = false;
let currentSpeech = null;

/* =====================================================
                    CREATOR DATA
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
                    INITIALIZATION
===================================================== */
document.addEventListener("DOMContentLoaded", initializeCLOUT);

function initializeCLOUT() {
  createControlBar();
  setupForm();
  setupInput();
  setupStopButton();
  setupVoiceInput();
  updateConnectionStatus();
  setInterval(updateConnectionStatus, 30000);
  messageInput?.focus();
  console.log("CLOUT AI initialized. Creator:", CLOUT_CREATOR.name);
}

/* =====================================================
                    CONTROL BAR
===================================================== */
function createControlBar() {
  if (document.querySelector("#clout-controls")) return;

  const controls = document.createElement("div");
  controls.id = "clout-controls";
  controls.innerHTML = `
    <button type="button" id="new-chat-button">＋ New Chat</button>
    <button type="button" id="clear-chat-button">🗑 Clear</button>
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
    if (e.key === "Enter" &&!e.shiftKey) {
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
  stopButton.hidden = true;
  stopButton.addEventListener("click", stopGeneration);
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
    connectionStatus.textContent = data?.status === "online"? "● Online" : "● Offline";
    connectionStatus.classList.add(data?.status === "online"? "online" : "offline");
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

  const message = (typeof customMessage === "string"? customMessage : messageInput.value).trim();
  if (!message) return;

  lastUserMessage = message;

  // 1. USER MESSAGE
  const userMessage = createMessage("user");
  userMessage.bubble.textContent = message;
  conversation.push({ role: "user", content: message });
  trimConversation();

  messageInput.value = "";
  messageInput.style.height = "auto";

  // 2. AI MESSAGE
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
        if (fullResponse.trim()) {
          conversation.push({ role: "assistant", content: fullResponse });
          trimConversation();
          addCopyButton(aiMessage.message, fullResponse);
          addSpeakButton(aiMessage.message, fullResponse);
          addRegenerateButton(aiMessage.message);
        } else {
          aiMessage.bubble.textContent = "I couldn't generate a response.";
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
    if (error.name === "AbortError" && fullResponse.trim()) {
      conversation.push({ role: "assistant", content: fullResponse });
      trimConversation();
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
                  GENERATION STATE
===================================================== */
function setGenerating(state) {
  isGenerating = state;
  if (sendButton) sendButton.disabled = state;
  if (stopButton) stopButton.hidden =!state;
}

function stopGeneration() {
  controller?.abort();
  controller = null;
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
      button.textContent = "❌ Failed";
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
  if (!Array.isArray(sources) ||!sources.length) return;
  messageElement.querySelector(".clout-sources")?.remove();
  const container = document.createElement("div");
  container.className = "clout-sources";
  container.innerHTML = `<div class="sources-heading">🌐 Web Sources</div>`;
  sources.forEach(source => {
    if (!source?.url) return;
    try {
      const safeURL = new URL(source.url);
      if (!["http:", "https:"].includes(safeURL.protocol)) return;
      const link = document.createElement("a");
      link.className = "source-card";
      link.href = safeURL.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.innerHTML = `<div class="source-title">${source.title || "Web source"}</div><div class="source-domain">${source.domain || safeURL.hostname}</div>`;
      container.appendChild(link);
    } catch {}
  });
  if (container.querySelector(".source-card")) messageElement.appendChild(container);
}

/* =====================================================
                  REGENERATE
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
  if (isGenerating ||!lastUserMessage) return;
  if (conversation[conversation.length - 1]?.role === "assistant") conversation.pop();
  chatMessages?.querySelector(".message.assistant:last-of-type")?.remove();
  sendMessage(lastUserMessage);
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
    sendMessage(lastUserMessage);
  });
  messageElement.appendChild(button);
}

/* =====================================================
                 CONVERSATION LIMIT
===================================================== */
function trimConversation() {
  if (conversation.length > 12) conversation = conversation.slice(-12);
}

/* =====================================================
                    NEW CHAT
===================================================== */
function startNewChat() {
  controller?.abort();
  stopSpeech();
  stopVoiceInput();
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
                    VOICE INPUT
===================================================== */
function setupVoiceInput() {
  if (!voiceButton) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButton.textContent = "🚫";
    voiceButton.title = "Voice input not supported";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  voiceButton.addEventListener("click", () => isListening? stopVoiceInput() : startVoiceInput());

  recognition.addEventListener("result", e => {
    let transcript = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    if (messageInput) {
      messageInput.value = transcript;
      resizeInput();
    }
  });

  recognition.addEventListener("start", () => {
    isListening = true;
    voiceButton.classList.add("recording");
    voiceButton.textContent = "⏹️";
    voiceButton.title = "Stop listening";
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    voiceButton.classList.remove("recording");
    voiceButton.textContent = "🎙️";
    voiceButton.title = "Speak to CLOUT";
  });

  recognition.addEventListener("error", e => {
    console.error("Voice error:", e.error);
    stopVoiceInput();
  });
}

function startVoiceInput() {
  if (!recognition || isListening) return;
  try { recognition.start(); } catch (e) { console.error(e); }
}

function stopVoiceInput() {
  if (!recognition ||!isListening) return;
  try { recognition.stop(); } catch {}
}

/* =====================================================
                  VOICE OUTPUT
===================================================== */
function addSpeakButton(messageElement, text) {
  if (messageElement.querySelector(".speak-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "speak-button";
  button.textContent = "🔊 Listen";
  button.addEventListener("click", () => speakText(text, button));
  messageElement.appendChild(button);
}

function speakText(text, button) {
  if (!("speechSynthesis" in window)) return;
  if (speechSynthesis.speaking) {
    stopSpeech();
    return;
  }
  const cleanText = String(text).replace(/[*_~`]/g, "").replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  currentSpeech = utterance;

  button.textContent = "⏹ Stop";
  utterance.onend = utterance.onerror = () => {
    button.textContent = "🔊 Listen";
    currentSpeech = null;
  };
  speechSynthesis.speak(utterance);
}

function stopSpeech() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  currentSpeech = null;
  document.querySelectorAll(".speak-button").forEach(b => b.textContent = "🔊 Listen");
}

/* =====================================================
                    SCROLL
===================================================== */
function scrollToBottom() {
  chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
}

window.addEventListener("beforeunload", () => {
  controller?.abort();
  stopSpeech();
});

/* =====================================================
                  CLOUT DEBUG API
===================================================== */
window.CLOUT = {
  creator: CLOUT_CREATOR,
  getConversation: () => [...conversation],
  clearChat: startNewChat,
  stop: stopGeneration,
  stopSpeech,
  isGenerating: () => isGenerating
};
