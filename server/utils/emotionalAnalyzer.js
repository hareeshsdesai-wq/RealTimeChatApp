const Sentiment = require("sentiment");
const sentiment = new Sentiment();

function detectEmotion(text) {
  if (!text || typeof text !== "string") return "neutral";
  const result = sentiment.analyze(text);

  if (result.score > 3) return "happy";
  if (result.score > 0) return "positive";
  if (result.score < -1) return "angry";  // ← only this line changed
  if (result.score < 0) return "sad";
  return "neutral";
}

module.exports = detectEmotion;