// src/socket.js

let io = null;

// ✅ Store connected users: userId -> socketId
const users = new Map();

const setSocketIO = (instance) => {
  io = instance;

  io.on("connection", (socket) => {
    if (!socket.handshake.auth?.logged) {
  console.log("🔌 New client connected:", socket.id);
  socket.handshake.auth = { logged: true };
}

    // ✅ Frontend will send its MongoDB user _id after connect
    socket.on("register", (userId) => {
  if (!userId) {
    console.warn("⚠ Register called with no userId");
    return;
  }

  users.set(String(userId), socket.id);

  console.log(`👤 Registered user ${userId} -> socket ${socket.id}`);
  console.log("🧪 Active users:", Array.from(users.entries()));
});

   socket.on("disconnect", (reason) => {
  console.log("❌ Client disconnected:", socket.id, "| reason:", reason);

  for (const [userId, socketId] of users.entries()) {
    if (socketId === socket.id) {
      users.delete(userId);
      console.log(`🧹 Removed user ${userId} from active sockets`);
      break;
    }
  }

  console.log("🧪 Remaining users:", Array.from(users.entries()));
});
  });
};

const getSocketIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
};

// ✅ Emit event to one specific user
const emitToUser = (userId, eventName, payload) => {
  if (!io || !userId) return false;

  const socketId = users.get(String(userId));

  if (!socketId) {
  console.warn(`⚠ User not connected: ${userId}`);
  console.log("🧪 Active users:", Array.from(users.entries()));
  return false;
}

  io.to(socketId).emit(eventName, payload);
  console.log(`📡 Sent ${eventName} to user ${userId}`);
  return true;
};

module.exports = {
  setSocketIO,
  getSocketIO,
  emitToUser
};