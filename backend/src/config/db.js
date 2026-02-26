const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri || typeof uri !== "string") {
      throw new Error("MONGO_URI is missing in backend/.env");
    }

    // Common typo guard: mongodb+srv://user:pass@alias@cluster...
    if ((uri.match(/@/g) || []).length > 1 && uri.startsWith("mongodb+srv://")) {
      throw new Error(
        "Invalid MONGO_URI format. Use mongodb+srv://<user>:<pass>@<cluster-host>/<db>"
      );
    }

    await mongoose.connect(uri);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
