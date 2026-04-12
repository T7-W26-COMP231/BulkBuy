// server-comms-only.js
// Same bootstrap flow as your original server.js but uses comms-js.initComms only.
// Non-disruptive: does not modify any other files. Keeps the same start/stop behavior.

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

    // create express app (same as original)
    const { app } = await createApp();

    // start HTTP server
    const server = app.listen(config.port, () => {
      console.log(`\nServer running in ${config.nodeEnv} mode on port ${config.port} | <--- 🤗 |\n`);
    });

    // ---------------------------------------------------------
    // Comms-only initialization (no legacy attachSocketHandlers)
    //
    // Behavior:
    //  - Attempts to require ./src/comms-js and call initComms with the running server.
    //  - If comms-js is missing or initComms throws, logs the error and continues running the HTTP server.
    //  - Does not call attachSocketHandlers at all.
    // ---------------------------------------------------------

    try {
      const comms = require('./src/comms-js'); // must export initComms
      if (!comms || typeof comms.initComms !== 'function') {
        console.error('comms-js.initComms is not available. Ensure ./src/comms-js/index.js exports initComms.');
      } else {
        try {
          await comms.initComms({
            server,
            jwtSecret: process.env.ACCESS_SECRET || config.accessSecret,
            path: process.env.SOCKET_PATH || '/',
            cors: { origin: config.clientUrl || true, credentials: true },
            logger: console
            // pass redisClient here if you have one: redisClient: myRedisClient
          });
          console.log('\nComms initialized via comms-js.initComms | <--- 🤗 |\n');
        } catch (err) {
          console.error('comms-js.initComms failed:', err);
          // continue running HTTP server even if comms init fails
        }
      }
    } catch (err) {
      console.error('Failed to require comms-js module (./src/comms-js). Socket subsystem not initialized.', err);
      // continue running HTTP server
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
