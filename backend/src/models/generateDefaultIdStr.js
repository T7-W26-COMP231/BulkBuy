const mongoose = require('mongoose');

const generateRandomId = (length = 16) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

const generateDefaultIdStr = async function (doc, options = {}) {
  const length = options.length || 16;
  const maxAttempts = options.maxAttempts || 5;

  const Model = doc.constructor; // 🔥 key: works for ANY schema

  let attempts = 0;
  let newId;
  let exists = true;

  while (exists && attempts < maxAttempts) {
    newId = generateRandomId(length);
    exists = await Model.exists({ _id: newId });
    attempts++;
  }

  if (exists) {
    throw new Error('Failed to generate unique _id after max attempts');
  }

  return newId;
};

module.exports = { generateDefaultIdStr };