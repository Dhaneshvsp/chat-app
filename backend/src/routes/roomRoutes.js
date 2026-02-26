const express = require("express");
const {
  addRoomMember,
  createRoom,
  getRoomMessages,
  getRooms,
} = require("../controllers/roomController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createRoom);
router.get("/", protect, getRooms);
router.get("/:roomId/messages", protect, getRoomMessages);
router.put("/:roomId/members", protect, addRoomMember);
router.post("/:roomId/members", protect, addRoomMember);

module.exports = router;
