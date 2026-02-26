const express = require("express");
const { sendMessage } = require("../controllers/messageController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post("/", protect, upload.single("media"), sendMessage);

module.exports = router;
