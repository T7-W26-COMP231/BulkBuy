// src/app.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { Server: IOServer } = require('socket.io');
const http = require('http');
const { logSocketConnect } = require('./comms-js/websocket/logSocketConnect');

const config = require('./config/env');

// route imports
const authRoutes = require('./routes/auth.routes');
const auditRoutes = require('./routes/audit.routes');
const itemRoutes = require('./routes/item.routes');
const messageRoutes = require('./routes/message.routes');
const socketRoutes = require('./comms-js/websocket/routes/notifications.routes'); // canonical comms routes
const emailingRoutes = require('./comms-js/emailing/email.routes'); // canonical comms routes
const orderRoutes = require('./routes/order.routes');
const productRoutes = require('./routes/product.routes');
const regionMapRoutes = require('./routes/regionMap.routes');
const reviewRoutes = require('./routes/review.routes');
const salesWindowRoutes = require('./routes/salesWindow.routes');
const supplyRoutes = require('./routes/supply.routes');
const userRoutes = require('./routes/user.routes');
const aggregationRoutes = require('./routes/aggregation.routes');
const configRoutes = require('./routes/config.routes');
const opsContextRoutes = require('./routes/ops-context.routes');
const s3storeRoutes = require('./routes/s3Storage.routes');
const deliveryRuleRoutes = require('./routes/deliveryRule.routes');

const errorMiddleware = require('./middleware/error.middleware');
const correlationMiddleware = require('./middleware/correlation.middleware');

// socket handlers (attach after server.listen)
const socketHandlers = require('./comms-js/websocket/socketHandlers');

const createApp = async () => {
  const app = express();

  // Trust proxy when behind a load balancer (adjust if not needed)
  if (config.trustProxy) app.set('trust proxy', 1);

  // Basic security and parsing
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Correlation ID middleware (must run early so controllers/services can use req.correlationId)
  app.use(correlationMiddleware);

  // Logging
  if (config.nodeEnv !== 'production') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  // CORS 
  // app.use(cors({
  //   origin: config.clientUrl,
  //   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  //   allowedHeaders: ['Content-Type', 'Authorization', 'authorization', 'X-Correlation-Id', 'x-correlation-id'],
  //   credentials: true
  // }));

  app.use(cors({
    origin: function (origin, callback) {
      const allowed = (config.clientUrl || '').split(',').map(u => u.trim());
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'authorization', 'X-Correlation-Id', 'x-correlation-id'],
    credentials: true
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    //max: 100,
    max: process.env.NODE_ENV === 'production' ? 100 : 10000, // ← high in dev
    standardHeaders: true,
    legacyHeaders: false
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(limiter);
  }
  //app.use(limiter);

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // API routes (versioned)
  app.use('/api/auth', authRoutes);
  app.use('/api/audts', auditRoutes);
  app.use('/api/aggrs', aggregationRoutes);
  app.use('/api/configs', configRoutes);
  app.use('/api/comms', messageRoutes); // message REST endpoints
  app.use('/api/comms', emailingRoutes); // emailing REST endpoints
  app.use('/api/comms', socketRoutes);  // comms websocket-related REST endpoints (missed/ack/create/broadcast)
  app.use('/api/ordrs', orderRoutes);   // legacy teammate route
  app.use('/api/orders', orderRoutes);  // admin dashboard + clean route
  app.use('/api/prdts', productRoutes);
  app.use('/api/rmaps', regionMapRoutes);
  app.use('/api/revws', reviewRoutes);
  app.use('/api/swnds', salesWindowRoutes);
  app.use('/api/supls', supplyRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/revws', reviewRoutes);
  app.use('/api/opscs', opsContextRoutes);
  app.use('/api/s3fgo', s3storeRoutes);
  app.use('/api/configs', configRoutes);
  app.use('/api/delivery-rules', deliveryRuleRoutes);
  app.use('/api/comms', messageRoutes);


  // Serve frontend in production
  if (config.nodeEnv === 'production') {
    const path = require('path');
    const fs = require('fs');
    const frontendDist = path.join(__dirname, '../../frontend/dist');

    if (fs.existsSync(frontendDist)) {
      app.use(express.static(frontendDist));
      app.get('*', (req, res) => {
        res.sendFile(path.join(frontendDist, 'index.html'));
      });
    }
  }

  // 404 handler (API routes only)
  app.use((req, res, next) => {
    res.status(404).json({ success: false, error: 'Not Found' });
  });


  // Centralized error handler
  app.use(errorMiddleware);

  /**
   * attachSocketHandlers(server)
   * - Creates a Socket.IO server bound to the provided HTTP server
   * - Attaches your socketHandlers and returns the io instance
   *
   * Usage:
   *   const server = app.listen(port);
   *   await attachSocketHandlers(server);
   */
  async function attachSocketHandlers(server) {
    if (!server) throw new Error('HTTP server required to attach sockets');

    // create Socket.IO server
    const io = new IOServer(server, {
      cors: {
        origin: config.clientUrl,
        methods: ['GET', 'POST']
      }
    });

    // attach your handlers (this registers connection listeners)
    socketHandlers.attachHandlers(io);

    return io;
  }

  // return both app and attach helper so server bootstrap can attach sockets after listen()
  return { app, attachSocketHandlers };
};

module.exports = createApp;
