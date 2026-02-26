const http = require("http");
const dotenv = require("dotenv");
const { Server } = require("socket.io");

dotenv.config();
const app = require("./app");
const connectDB = require("./config/db");
const initSocket = require("./socket");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST"],
    },
  });

  initSocket(io);
  app.set("io", io);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
