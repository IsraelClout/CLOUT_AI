/* =========================================================
   CLOUT AI
   FRONTEND APPLICATION v2
   Created by Gokah Israel Ewoenam
   ========================================================= */

/* =========================================================
   CREATOR INFO
   ========================================================= */
const CLOUT_CREATOR = {
  name: "Gokah Israel Ewoenam",
  age: 18,
  nationality: "Ghanaian",
  ethnicOrigin: "Ewe",
  hometown: "Akatsi",
  region: "Volta Region",
  country: "Ghana"
};

/* =========================================================
   DOM ELEMENTS
   ========================================================= */
const elements = {
  chatBox: document.getElementById("chatBox"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  sendButton: document.getElementById("sendButton"),
  aboutButton: document.getElementById("aboutButton"),
  aboutModal: document.getElementById("aboutModal"),
  closeAbout: document.getElementById("closeAbout")
};

let isProcessing = false;

/* =========================================================
   UTILS
   ========================================================= */
function scrollToBottom() {
  elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
}

/* =========================================================
   MESSAGE RENDERING
   ========================================================= */
function addMessage(text, sender, mode = "") {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${sender}-message`;

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "bubble";
  
  // textContent prevents XSS
  bubbleEl.textContent = text;

  // AI mode indicator
  if (sender === "ai" && mode) {
    const modeLabel = document.createElement("small");
    modeLabel.className = "message-mode";
    modeLabel.textContent = mode === "internet" ? "🌐 Internet AI" : "🤖 CLOUT AI";
    
    bubbleEl.appendChild(document.createElement("br"));
    bubbleEl.appendChild(modeLabel);
  }

  messageEl.appendChild(bubbleEl);
  elements.chatBox.appendChild(messageEl);
  scrollToBottom();
}

/* =========================================================
   TYPING INDICATOR
   ========================================================= */
function showTyping() {
  removeTyping();

  const messageEl = document.createElement("div");
  messageEl.id = "typingMessage";
  messageEl.className = "message ai-message";

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "bubble typing-bubble";
  bubbleEl.innerHTML = `<span></span><span></span><span></span>`;

  messageEl.appendChild(bubbleEl);
  elements.chatBox.appendChild(messageEl);
  scrollToBottom();
}

function removeTyping() {
  document.getElementById("typingMessage")?.remove();
}

/* =========================================================
   INPUT STATE
   ========================================================= */
function setProcessingState(processing) {
  isProcessing = processing;
  elements.messageInput.disabled = processing;
  elements.sendButton.disabled = processing || !elements.messageInput.value.trim();
}

/* =========================================================
   SEND MESSAGE LOGIC
   ========================================================= */
async function sendMessage() {
  if (isProcessing) return;

  const message = elements.messageInput.value.trim();
  if (!message) return;

  setProcessingState(true);
  addMessage(message, "user");
  elements.messageInput.value = "";
  showTyping();

  try {
    if (typeof CLOUT_API === "undefined") {
      throw new Error("api.js is not loaded. Please check your script tag.");
    }

    const result = await CLOUT_API.chat(message);
    removeTyping();

    if (!result || result.success === false) {
      addMessage(
        result?.error || "CLOUT could not process your request.",
        "ai",
        "internet"
      );
      return;
    }

    const response = result.response || result.message || result.reply;
    if (!response) {
      addMessage("The AI returned an empty response.", "ai", "internet");
      return;
    }

    addMessage(response, "ai", result.mode || "internet");

  } catch (error) {
    removeTyping();
    console.error("CLOUT ERROR:", error);
    addMessage("⚠️ CLOUT could not connect to the Internet AI service.", "ai", "internet");
  } finally {
    setProcessingState(false);
    elements.messageInput.focus();
  }
}

/* =========================================================
   MODAL HANDLING
   ========================================================= */
function openModal() {
  elements.aboutModal.hidden = false;
  requestAnimationFrame(() => elements.aboutModal.classList.add("active"));
  document.body.style.overflow = "hidden"; // prevent background scroll
}

function closeModal() {
  elements.aboutModal.classList.remove("active");
  document.body.style.overflow = "";
  // wait for animation to finish before hiding
  setTimeout(() => {
    if (!elements.aboutModal.classList.contains("active")) {
      elements.aboutModal.hidden = true;
    }
  }, 250);
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */
elements.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});

elements.messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// enable/disable send button as user types
elements.messageInput.addEventListener("input", () => {
  elements.sendButton.disabled = !elements.messageInput.value.trim() || isProcessing;
});

elements.aboutButton.addEventListener("click", openModal);
elements.closeAbout.addEventListener("click", closeModal);

// close modal on background click
elements.aboutModal.addEventListener("click", (e) => {
  if (e.target === elements.aboutModal) closeModal();
});

// close modal on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !elements.aboutModal.hidden) closeModal();
});

/* =========================================================
   INITIALIZATION
   ========================================================= */
function initializeCLOUT() {
  addMessage(
    `Hello! 👋 I'm CLOUT AI.\n\nI'm ready to answer your questions. Internet access will be connected in the next step.\n\nCreated by ${CLOUT_CREATOR.name}.`,
    "ai",
    "internet"
  );
  elements.messageInput.focus();
}

document.addEventListener("DOMContentLoaded", initializeCLOUT);

/* =========================================================
   GLOBAL EXPORT
   ========================================================= */
window.CLOUT_CREATOR = CLOUT_CREATOR;
