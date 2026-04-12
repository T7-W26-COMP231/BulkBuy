// src/middleware/error.middleware.js
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({
    success: false, error: message,
    details: err.details ?? null  // ← ADD THIS

  });
}

module.exports = errorHandler;
