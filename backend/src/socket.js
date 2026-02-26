const jwt = require("jsonwebtoken");
const Message = require("./models/Message");
const Room = require("./models/Room");
const User = require("./models/User");

const initSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select("-password");

      if (!user) {
        return next(new Error("Unauthorized"));
      }

      socket.user = user;
      next();
    } catch (_error) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join_room", async (roomId) => {
      const room = await Room.findOne({ _id: roomId, members: socket.user._id });
      if (!room) {
        socket.emit("socket_error", "Room not found or access denied");
        return;
      }

      socket.join(roomId);
    });

    socket.on("send_message", async (payload) => {
      try {
        const { roomId, message = "", mediaUrl = null, mediaType = null } = payload;
        const room = await Room.findOne({ _id: roomId, members: socket.user._id });

        if (!room) {
          socket.emit("socket_error", "Room not found or access denied");
          return;
        }

        if (!message.trim() && !mediaUrl) {
          socket.emit("socket_error", "Message or media is required");
          return;
        }

        const newMessage = await Message.create({
          senderId: socket.user._id,
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

        io.to(roomId).emit("receive_message", populated);
      } catch (error) {
        socket.emit("socket_error", error.message);
      }
    });

    socket.on("disconnect", () => {
      // no-op
    });
  });
};

module.exports = initSocket;
