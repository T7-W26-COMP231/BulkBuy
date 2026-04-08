// src/utils/jwt.helper.js
const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES = '30m' || '15m' || process.env.ACCESS_EXPIRES;
const REFRESH_EXPIRES = '7d' || process.env.REFRESH_EXPIRES;
const ACCESS_SECRET = process.env.ACCESS_SECRET || 'change_this_access_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'change_this_refresh_secret';

function signAccess(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function signRefresh(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
