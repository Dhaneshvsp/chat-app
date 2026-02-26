const mongoose = require("mongoose");
const Room = require("../models/Room");
const Message = require("../models/Message");

const createRoom = async (req, res) => {
  try {
    const { name, memberIds = [], isPrivate = false } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Room name is required" });
    }

    const uniqueMembers = [...new Set([req.user._id.toString(), ...memberIds])];
    const memberObjectIds = uniqueMembers
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (isPrivate && memberObjectIds.length === 2) {
      const existingPrivateRoom = await Room.findOne({
        isPrivate: true,
        members: { $all: memberObjectIds, $size: 2 },
      })
        .populate("members", "name email")
        .populate("createdBy", "name email");

      if (existingPrivateRoom) {
        return res.json(existingPrivateRoom);
      }
    }

    const room = await Room.create({
      name,
      isPrivate,
      members: memberObjectIds,
      createdBy: req.user._id,
    });

    const populated = await Room.findById(room._id)
      .populate("members", "name email")
      .populate("createdBy", "name email");

    return res.status(201).json(populated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user._id })
      .populate("members", "name email")
      .sort({ updatedAt: -1 });

    return res.json(rooms);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Invalid room id" });
    }

    const room = await Room.findOne({ _id: roomId, members: req.user._id });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const messages = await Message.find({ roomId })
      .populate("senderId", "name email")
      .sort({ createdAt: 1 });

    return res.json(messages);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const addRoomMember = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { memberId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roomId) || !mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ message: "Invalid room or member id" });
    }

    const room = await Room.findOne({ _id: roomId, members: req.user._id });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (room.isPrivate) {
      return res.status(400).json({ message: "Cannot add members to a private chat" });
    }

    const alreadyMember = room.members.some((member) => member.toString() === memberId);
    if (alreadyMember) {
      return res.status(409).json({ message: "User is already in this room" });
    }

    room.members.push(new mongoose.Types.ObjectId(memberId));
    room.updatedAt = new Date();
    await room.save();

    const populatedRoom = await Room.findById(room._id)
      .populate("members", "name email")
      .populate("createdBy", "name email");

    return res.json(populatedRoom);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { createRoom, getRooms, getRoomMessages, addRoomMember };
