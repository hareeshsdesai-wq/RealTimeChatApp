/**
 * emotion-chat.js
 * ----------------
 * Drop this script into your HTML AFTER socket.io.js and your existing chat.js.
 *
 * It patches the message rendering to:
 *  1. Apply the correct emotion CSS class to each bubble.
 *  2. Show a small emotion label below the bubble.
 *  3. Show smart reply suggestion buttons.
 *
 * HOW TO USE
 * ----------
 * 1. Add to your HTML:
 *      <link rel="stylesheet" href="/css/emotions.css">
 *      <script src="/js/replySuggestions.js"></script>
 *      <script src="/js/emotion-chat.js"></script>
 *
 * 2. Call renderMessage(msgObj, isSent) instead of your existing message-render code.
 *    msgObj must have: { message, emotion }
 *
 * 3. Pass the emotion in your socket.emit("sendMessage", ...) payload — the server
 *    will detect it, but if you want the sender to see it immediately, include it
 *    in the optimistic UI update too.
 */

/**
 * Creates and appends a chat message bubble to the messages container.
 *
 * @param {Object} msgObj   - { message: string, emotion: string, senderId: string }
 * @param {boolean} isSent  - true if this message was sent by the current user
 * @param {HTMLElement} container - the scrollable messages div
 */
function renderEmotionMessage(msgObj, isSent, container) {
  const { message, emotion = "neutral" } = msgObj;

  // Wrapper keeps bubble + tag together
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.alignItems = isSent ? "flex-end" : "flex-start";
  wrapper.style.marginBottom = "10px";

  // Bubble
  const bubble = document.createElement("div");
  bubble.classList.add("message");
  bubble.classList.add(isSent ? "sent" : "received");
  if (isSent) bubble.classList.add(emotion); // emotion color only on sent bubbles
  bubble.textContent = message;

  // Emotion tag (small label below bubble)
  const tag = document.createElement("div");
  tag.classList.add("emotion-tag");
  tag.textContent = emotion;

  wrapper.appendChild(bubble);
  wrapper.appendChild(tag);
  container.appendChild(wrapper);

  // Show smart replies only for incoming messages
  if (!isSent) {
    const replies = getSuggestions(emotion);
    if (replies.length) {
      const row = document.createElement("div");
      row.classList.add("smart-replies");
      replies.forEach((text) => {
        const btn = document.createElement("button");
        btn.classList.add("smart-reply-btn");
        btn.textContent = text;
        btn.addEventListener("click", () => {
          // Fill the message input with the suggestion
          const input =
            document.querySelector("#messageInput") ||
            document.querySelector("input[type='text']");
          if (input) {
            input.value = text;
            input.focus();
          }
          row.remove();
        });
        row.appendChild(btn);
      });
      container.appendChild(row);
    }
  }

  // Auto-scroll to latest message
  container.scrollTop = container.scrollHeight;
}

// Expose globally so your existing chat.js can call it
window.renderEmotionMessage = renderEmotionMessage;