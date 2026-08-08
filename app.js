/*

                     CLOUT AI
                  COMPLETE APP.JS v4.0

Works with the new glassmorphism index.html
Created by Gokah Israel Ewoenam

*/

import { streamChat, checkAPI } from "./api.js";

/* =====================================================
                    DOM ELEMENTS
===================================================== */
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const messages = document.querySelector("#messages");
const sendButton = document.querySelector("#sendButton");
const typingIndicator = document.querySelector("#typingIndicator");
const welcomeCard = document.querySelector("#welcomeCard");

/* =====================================================
                    CLOUT STATE
===================================================== */
let conversation = [];
let controller = null;
let isGenerating = false;
let lastUserMessage = "";
let currentAIMessage = null;

/* =====================================================
                    INITIALIZATION
===================================================== */
document.addEventListener("DOMContentLoaded", initializeCLOUT);

function initializeCLOUT() {
    setupChatForm();
    setupInput();
    setupSuggestions();
    checkConnection();
    console.log("CLOUT AI v4.0 initialized successfully.");
}

/* =====================================================
                    CHAT FORM
===================================================== */
function setupChatForm() {
    if (!chatForm) {
        console.error("CLOUT AI: #chatForm not found.");
        return;
    }

    chatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (isGenerating) {
            stopGeneration();
        } else {
            sendMessage();
        }
    });
}

/* =====================================================
                    INPUT
===================================================== */
function setupInput() {
    if (!messageInput) return;

    messageInput.addEventListener("input", resizeInput);

    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!isGenerating) sendMessage();
        }
    });
}

function resizeInput() {
    if (!messageInput) return;
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
}

/* =====================================================
                    SUGGESTIONS
===================================================== */
function setupSuggestions() {
    document.querySelectorAll(".suggestion").forEach(button => {
        button.addEventListener("click", () => {
            const prompt = button.dataset.prompt;
            if (!prompt) return;
            messageInput.value = prompt;
            resizeInput();
            messageInput.focus();
            hideWelcome();
        });
    });
}

/* =====================================================
                    SEND MESSAGE
===================================================== */
async function sendMessage(customMessage = null) {
    if (isGenerating) return;

    const message = typeof customMessage === "string" 
        ? customMessage.trim() 
        : messageInput?.value.trim();

    if (!message) return;

    lastUserMessage = message;
    hideWelcome();

    // USER MESSAGE
    addMessage(message, "user");
    conversation.push({ role: "user", content: message });
    trimConversation();

    if (messageInput) {
        messageInput.value = "";
        messageInput.style.height = "auto";
    }

    // AI MESSAGE
    const aiMessage = createAIMessage();
    currentAIMessage = aiMessage;
    controller = new AbortController();
    setGenerating(true);

    let fullResponse = "";

    try {
        await streamChat(
            message,
            // ON CHUNK
            (chunk) => {
                fullResponse += chunk;
                removeTypingIndicator();
                aiMessage.bubble.textContent = fullResponse;
                scrollToBottom();
            },
            // ON DONE
            () => {
                finishAIMessage(aiMessage, fullResponse);
            },
            // ON ERROR
            (error) => {
                handleAIError(aiMessage, error);
            },
            // ON SOURCES
            (sourceData) => {
                if (sourceData?.searchedWeb && Array.isArray(sourceData.sources)) {
                    addSourceCards(aiMessage.container, sourceData.sources);
                }
            },
            // ABORT SIGNAL
            controller.signal,
            // CONVERSATION
            conversation
        );
    } catch (error) {
        if (error.name === "AbortError") {
            if (fullResponse.trim()) {
                conversation.push({ role: "assistant", content: fullResponse });
                trimConversation();
            }
        } else {
            console.error("CLOUT request error:", error);
        }
    } finally {
        controller = null;
        currentAIMessage = null;
        setGenerating(false);
        scrollToBottom();
        if (messageInput) messageInput.focus();
    }
}

/* =====================================================
                CREATE MESSAGES
===================================================== */
function addMessage(text, role) {
    const message = document.createElement("div");
    message.className = `message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = text;

    message.appendChild(bubble);
    messages.appendChild(message);
    scrollToBottom();
    return message;
}

function createAIMessage() {
    const message = document.createElement("div");
    message.className = "message assistant";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = "";

    message.appendChild(bubble);
    messages.appendChild(message);
    createTypingIndicator();
    scrollToBottom();

    return { container: message, bubble: bubble };
}

/* =====================================================
                  TYPING INDICATOR
===================================================== */
function createTypingIndicator() {
    if (!typingIndicator) return;
    typingIndicator.style.display = "flex";
}

function removeTypingIndicator() {
    if (!typingIndicator) return;
    typingIndicator.style.display = "none";
}

/* =====================================================
                  FINISH RESPONSE
===================================================== */
function finishAIMessage(aiMessage, response) {
    removeTypingIndicator();

    if (!response.trim()) {
        aiMessage.bubble.textContent = "I couldn't generate a response.";
        addRetryButton(aiMessage.container);
        return;
    }

    aiMessage.bubble.textContent = response;
    conversation.push({ role: "assistant", content: response });
    trimConversation();
    addMessageActions(aiMessage.container, response);
    scrollToBottom();
}

/* =====================================================
                    ERROR
===================================================== */
function handleAIError(aiMessage, error) {
    removeTypingIndicator();
    const errorText = error instanceof Error ? error.message : String(error || "Unknown error");
    
    aiMessage.bubble.textContent = "⚠️ CLOUT AI couldn't complete the request.";
    console.error("AI error:", errorText);
    addRetryButton(aiMessage.container);
}

/* =====================================================
                    RETRY
===================================================== */
function addRetryButton(container) {
    if (container.querySelector(".retry-button")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "retry-button";
    button.textContent = "↻ Try again";

    button.addEventListener("click", () => {
        container.remove();
        sendMessage(lastUserMessage);
    });

    container.appendChild(button);
}

/* =====================================================
                  MESSAGE ACTIONS
===================================================== */
function addMessageActions(container, text) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    // COPY
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "copy-button";
    copyButton.textContent = "📋 Copy";
    copyButton.onclick = async () => {
        try {
            await copyText(text);
            copyButton.textContent = "✓ Copied";
            setTimeout(() => { copyButton.textContent = "📋 Copy"; }, 1500);
        } catch {
            copyButton.textContent = "❌ Failed";
        }
    };
    actions.appendChild(copyButton);

    // SPEAK
    const speakButton = document.createElement("button");
    speakButton.type = "button";
    speakButton.className = "speak-button";
    speakButton.textContent = "🔊 Listen";
    speakButton.onclick = () => { speakText(text, speakButton); };
    actions.appendChild(speakButton);

    // REGENERATE
    const regenerateButton = document.createElement("button");
    regenerateButton.type = "button";
    regenerateButton.className = "regenerate-button";
    regenerateButton.textContent = "↻ Regenerate";
    regenerateButton.onclick = () => { regenerate(container); };
    actions.appendChild(regenerateButton);

    container.appendChild(actions);
}

/* =====================================================
                    COPY
===================================================== */
async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
}

/* =====================================================
                  REGENERATE
===================================================== */
function regenerate(container) {
    if (isGenerating || !lastUserMessage) return;

    container.remove();
    if (conversation[conversation.length - 1]?.role === "assistant") conversation.pop();
    if (conversation[conversation.length - 1]?.role === "user") conversation.pop();
    sendMessage(lastUserMessage);
}

/* =====================================================
                    SOURCES
===================================================== */
function addSourceCards(container, sources) {
    if (!Array.isArray(sources) || !sources.length) return;

    const sourceBox = document.createElement("div");
    sourceBox.className = "clout-sources";

    const heading = document.createElement("div");
    heading.className = "sources-heading";
    heading.textContent = "🌐 Web Sources";
    sourceBox.appendChild(heading);

    sources.forEach(source => {
        if (!source?.url) return;
        try {
            const url = new URL(source.url);
            if (!["http:", "https:"].includes(url.protocol)) return;

            const link = document.createElement("a");
            link.className = "source-card";
            link.href = url.href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            const title = document.createElement("div");
            title.className = "source-title";
            title.textContent = source.title || "Web source";

            const domain = document.createElement("div");
            domain.className = "source-domain";
            domain.textContent = source.domain || url.hostname;

            link.appendChild(title);
            link.appendChild(domain);
            sourceBox.appendChild(link);
        } catch {
            // Invalid URL
        }
    });

    if (sourceBox.querySelector(".source-card")) {
        container.appendChild(sourceBox);
    }
}

/* =====================================================
                GENERATION STATE
===================================================== */
function setGenerating(state) {
    isGenerating = state;
    if (sendButton) {
        sendButton.disabled = state;
        sendButton.innerHTML = state 
            ? `<svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="6" width="12" height="12" fill="currentColor"/></svg>`
            : `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M22 2L11 13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22 2L15 22L11 13L2 9L22 2Z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
        sendButton.title = state ? "Stop generation" : "Send message";
    }
}

/* =====================================================
                    STOP
===================================================== */
function stopGeneration() {
    if (!controller) return;
    controller.abort();
    controller = null;
    removeTypingIndicator();
    setGenerating(false);
    if (currentAIMessage && currentAIMessage.bubble.textContent) {
        finishAIMessage(currentAIMessage, currentAIMessage.bubble.textContent);
    }
}

/* =====================================================
                  CLEAR CHAT
===================================================== */
function startNewChat() {
    stopGeneration();
    conversation = [];
    lastUserMessage = "";
    currentAIMessage = null;
    if (messages) messages.innerHTML = "";
    if (messageInput) {
        messageInput.value = "";
        messageInput.style.height = "auto";
        messageInput.focus();
    }
    if (welcomeCard) welcomeCard.style.display = "";
}

/* =====================================================
                VOICE OUTPUT
===================================================== */
function speakText(text, button) {
    if (!("speechSynthesis" in window)) return;

    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        button.textContent = "🔊 Listen";
        return;
    }

    const cleanText = String(text)
        .replace(/[*_~`]/g, "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-GH"; // Ghanaian English
    utterance.rate = 0.95;
    button.textContent = "⏹ Stop";

    utterance.onend = utterance.onerror = () => {
        button.textContent = "🔊 Listen";
    };

    speechSynthesis.speak(utterance);
}

/* =====================================================
                CONVERSATION LIMIT
===================================================== */
function trimConversation() {
    if (conversation.length > 12) {
        conversation = conversation.slice(-12);
    }
}

/* =====================================================
                  HIDE WELCOME
===================================================== */
function hideWelcome() {
    if (!welcomeCard) return;
    welcomeCard.style.display = "none";
}

/* =====================================================
                    SCROLL
===================================================== */
function scrollToBottom() {
    if (!messages) return;
    messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
}

/* =====================================================
                  CONNECTION
===================================================== */
async function checkConnection() {
    try {
        const data = await checkAPI();
        console.log("CLOUT API:", data);
        if (data?.status === "online") {
            console.log("✓ CLOUT AI backend online");
        }
    } catch (error) {
        console.warn("CLOUT API unavailable:", error);
    }
}

/* =====================================================
                  PUBLIC CLOUT API
===================================================== */
window.CLOUT = {
    getConversation: () => [...conversation],
    clearChat: startNewChat,
    stop: stopGeneration,
    send: sendMessage,
    isGenerating: () => isGenerating
};

/* =====================================================
                  CLEANUP
===================================================== */
window.addEventListener("beforeunload", () => {
    controller?.abort();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
});
