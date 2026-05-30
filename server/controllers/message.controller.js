const Message = require("../models/message.model");
const detectEmotion = require("../utils/emotionAnalyzer");

// Send a message — detects emotion and saves to DB
const sendMessage = async (req, res) => {
  try {
    const { message } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id; // set by auth middleware

    const emotion = detectEmotion(message);

    const newMessage = new Message({
      senderId,
      receiverId,
      message,
      emotion,
    });

    await newMessage.save();

    // Emit via Socket.IO (socket instance attached to req.app)
    const io = req.app.get("io");
    const receiverSocketId = req.app.get("onlineUsers")?.[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", {
        _id: newMessage._id,
        senderId,
        receiverId,
        message,
        emotion,
        createdAt: newMessage.createdAt,
      });
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error in sendMessage:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all messages between two users
const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const senderId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: senderId },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error in getMessages:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { sendMessage, getMessages };