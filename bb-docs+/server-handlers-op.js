// server.js
const createApp = require('./src/app');
const connectDB = require('./src/config/db');
const config = require('./src/config/env');

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

    // create express app
    const { app, attachSocketHandlers } = await createApp();

    // start HTTP server
    const server = app.listen(config.port, () => {
      console.log(`\nServer running in ${config.nodeEnv} mode on port ${config.port} | <--- 🤗 |\n`);
    });

    // initialize Socket.IO and attach handlers (non-blocking)
    try {
      await attachSocketHandlers(server);
      console.log('\nSocket handlers attached | <--- 🤗 |\n');
    } catch (err) {
      console.error('Failed to attach socket handlers:', err);
      // continue running HTTP server even if sockets fail
    }

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
