// server.js
const { createApp } = require('./src/app');
const { setSocketIO } = require('./src/socket');
const connectDB = require('./src/config/db');
const config = require('./src/config/env');
const http = require('http');
const { Server } = require('socket.io');

const start = async () => {
  try {
    await connectDB(config.mongoUri);

    // ---------------------------------------------------------
    const mongoose = require('mongoose');
    const enableMongooseDebugLogging = require('./src/config/capture-mongoose-debug');
    const disableLogging = enableMongooseDebugLogging(mongoose);

    const fs = require('fs');
    const path = require('path');

    function writeDebug(message) {
      const file = path.resolve(process.cwd(), 'debug.txt');
      const line = `${new Date().toISOString()} - ${message}\n`;
      fs.appendFileSync(file, line, { encoding: 'utf8' });
    }

    disableLogging();
    // ---------------------------------------------------------

    const app = await createApp();

    // ✅ HTTP server
    const server = http.createServer(app);

    // ✅ Socket.IO (ONLY ONCE)
    const io = new Server(server, {
      cors: {
        origin: config.clientUrl,
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // ✅ attach globally
    setSocketIO(io);

    // ✅ connection listener
    io.on('connection', (socket) => {
      console.log('🔌 New client connected:', socket.id);

      socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
      });
    });

    // ✅ start server
    server.listen(config.port, () => {
      console.log(`\n\nServer running in ${config.nodeEnv} mode on port ${config.port}`);
    });

    // ---------------------------------------------------------
    const shutdown = async () => {
      console.log('Shutting down server...');
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Forcing shutdown');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();