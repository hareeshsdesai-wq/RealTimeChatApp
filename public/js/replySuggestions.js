// replySuggestions.js
// Maps detected emotion -> list of smart reply buttons shown below the chat input

const suggestions = {
  happy: [
    "That's awesome!",
    "So happy for you!",
    "Congratulations!",
  ],
  positive: [
    "That's great!",
    "Sounds good!",
    "Nice!",
  ],
  sad: [
    "I'm here for you",
    "Want to talk about it?",
    "Things will get better",
  ],
  angry: [
    "Take it easy",
    "Let's solve it calmly",
    "I understand your frustration",
  ],
  neutral: [
    "Okay!",
    "Got it",
    "Sure!",
  ],
};

/**
 * Returns smart reply suggestions for a given emotion.
 * @param {string} emotion - one of happy | positive | sad | angry | neutral
 * @returns {string[]}
 */
function getSuggestions(emotion) {
  return suggestions[emotion] || suggestions.neutral;
}