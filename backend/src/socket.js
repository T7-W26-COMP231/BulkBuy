// src/socket.js

let io = null;

const setSocketIO = (instance) => {
  io = instance;
};

const getSocketIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

module.exports = {
  setSocketIO,
  getSocketIO
};