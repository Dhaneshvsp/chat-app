const mongoose = require("mongoose");
const Message = require("../models/Message");
const Room = require("../models/Room");

const sendMessage = async (req, res) => {
  try {
    const { roomId, message = "" } = req.body;

    if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Valid roomId is required" });
    }

    const room = await Room.findOne({ _id: roomId, members: req.user._id });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const file = req.file;
    const hasText = message && message.trim().length > 0;

    if (!hasText && !file) {
      return res.status(400).json({ message: "Message or media is required" });
    }

    const mediaUrl = file ? `/uploads/${file.filename}` : null;
    const mediaType = file
      ? file.mimetype.startsWith("image/")
        ? "image"
        : "file"
      : null;

    const newMessage = await Message.create({
      senderId: req.user._id,
      roomId,
      message,
      mediaUrl,
      mediaType,
      timestamp: new Date(),
    });

    const populated = await Message.findById(newMessage._id).populate(
      "senderId",
      "name email"
    );
    await Room.findByIdAndUpdate(roomId, { $set: { updatedAt: new Date() } });

    const io = req.app.get("io");
    if (io) {
      io.to(roomId).emit("receive_message", populated);
    }

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { sendMessage };
