const Sentiment = require("sentiment");
const sentiment = new Sentiment();

function detectEmotion(text) {
  if (!text || typeof text !== "string") return "neutral";
  const result = sentiment.analyze(text);

  console.log(text, "→ score:", result.score); // ← add this to debug

  if (result.score >= 3)  return "happy";
  if (result.score >= 1)  return "positive";
  if (result.score <= -3) return "angry";
  if (result.score <= -1) return "sad";
  return "neutral";
}

module.exports = detectEmotion;