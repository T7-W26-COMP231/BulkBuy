// src/app.js
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const config = require('./config/env');

// route imports
const authRoutes = require('./routes/auth.routes');
const auditRoutes = require('./routes/audit.routes');
const aggregationRoutes = require('./routes/aggregation.routes');
const configRoutes = require('./routes/config.routes');
const itemsRoutes = require('./routes/item.routes');
const messageRoutes = require('./routes/message.routes');
const orderRoutes = require('./routes/order.routes');
const productRoutes = require('./routes/product.routes');
const regionMapRoutes = require('./routes/regionMap.routes');
const reviewRoutes = require('./routes/review.routes');
const salesWindowRoutes = require('./routes/salesWindow.routes');
const supplyRoutes = require('./routes/supply.routes');
const usersRoutes = require('./routes/user.routes');
const s3storeRoutes = require('./routes/s3Storage.routes');

const { s3Ensure } = require('./scripts/s3.ensure');

const errorMiddleware = require('./middleware/error.middleware');
const correlationMiddleware = require('./middleware/correlation.middleware');

// ✅ Attach Socket.IO instance globally (clean architecture)
let io = null;

const setSocketIO = (socketInstance) => {
  io = socketInstance;
};

const getSocketIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

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
  app.use(cors({
    origin: [
      "http://localhost:5173",
      "https://bulkbuy-nb0w.onrender.com"
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'x-correlation-id'],
    credentials: true
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);

  // Ensure S3 bucket and baseline config before listening
  //  await s3Ensure({ logger: app.get('logger'), bucket: 'comp321-bulkbuy', enableCors: false });

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // API routes (versioned)
  app.use('/api/auth', authRoutes);
  app.use('/api/audts', auditRoutes);
  app.use('/api/aggrs', aggregationRoutes);
  app.use('/api/confg', configRoutes);
  app.use('/api/items', itemsRoutes);
  app.use('/api/comms', messageRoutes);
  app.use('/api/ordrs', orderRoutes);
  app.use('/api/prdts', productRoutes);
  app.use('/api/rmaps', regionMapRoutes);
  app.use('/api/revws', reviewRoutes);
  app.use('/api/swnds', salesWindowRoutes);
  app.use('/api/supls', supplyRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/s3fgo', s3storeRoutes);

  // 404 handler
  app.use((req, res, next) => {
    res.status(404).json({ success: false, error: 'Not Found' });
  });

  // Centralized error handler
  app.use(errorMiddleware);

  return app;
}

module.exports = {
  createApp,
  setSocketIO,
  getSocketIO
};
