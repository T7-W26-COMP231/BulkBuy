// src/repositories/message.repo.js
/**
 * Mongoose-backed repository for Message model
 * - Provides CRUD, pagination, and message-level helpers (attachments, recipients, status)
 * - Accepts opts: { session, new, select, populate, includeDeleted, lean, arrayFilters }
 * - Returns Mongoose documents by default; callers may call .toObject() if needed.
 */

const mongoose = require('mongoose');
const createError = require('http-errors');
const Message = require('../models/message.model');

function normalizeOpts(opts = {}) {
  return {
    session: opts.session || null,
    new: opts.new || false,
    select: opts.select || null,
    populate: opts.populate || null,
    includeDeleted: !!opts.includeDeleted,
    arrayFilters: opts.arrayFilters || null,
    lean: !!opts.lean
  };
}

class MessageRepo {
  /**
   * Create a message
   * @param {Object} payload
   * @param {Object} opts
   */
  async create(payload = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!payload || typeof payload !== 'object') throw createError(400, 'payload is required');
    if (o.session) {
      const docs = await Message.create([payload], { session: o.session });
      return docs[0];
    }
    return Message.create(payload);
  }

  /**
   * Find by id (optionally includeDeleted)
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async findById(id, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, 'id is required');
    const query = o.includeDeleted ? { _id: id } : { _id: id, deleted: false };
    let q = Message.findOne(query);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Find many with pagination
   * @param {Object} filter
   * @param {Object} opts - { page, limit, sort, select, populate, includeDeleted, session, lean }
   */
  async paginate(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const page = parseInt(opts.page || 1, 10) || 1;
    const limit = parseInt(opts.limit || 25, 10) || 25;
    const skip = (page - 1) * limit;

    const baseFilter = { ...filter };
    if (!o.includeDeleted) baseFilter.deleted = false;

    const countQuery = Message.countDocuments(baseFilter);
    const findQuery = Message.find(baseFilter).skip(skip).limit(limit).sort(opts.sort || { createdAt: -1 });

    if (o.select) findQuery.select(o.select);
    if (o.populate) findQuery.populate(o.populate);
    if (o.session) {
      findQuery.session(o.session);
      countQuery.session(o.session);
    }
    if (o.lean) findQuery.lean();

    const [total, items] = await Promise.all([countQuery.exec(), findQuery.exec()]);
    const pages = Math.max(1, Math.ceil(total / limit));
    return { items, total, page, limit, pages };
  }

  /**
   * Update by id
   * @param {String|ObjectId} id
   * @param {Object} update
   * @param {Object} opts
   */
  async updateById(id, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!id) throw createError(400, 'id is required');
    const query = { _id: id };
    if (!o.includeDeleted) query.deleted = false;

    const updateOpts = { new: !!o.new, session: o.session, runValidators: true };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    let q = Message.findOneAndUpdate(query, update, updateOpts);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.lean) q = q.lean();
    return q.exec();
  }

  /**
   * Update one by filter
   * @param {Object} filter
   * @param {Object} update
   * @param {Object} opts
   */
  async updateOne(filter = {}, update = {}, opts = {}) {
    const o = normalizeOpts(opts);
    if (!filter || Object.keys(filter).length === 0) throw createError(400, 'filter is required');
    const query = { ...filter };
    if (!o.includeDeleted) query.deleted = false;

    const updateOpts = { session: o.session, runValidators: true, new: !!o.new };
    if (o.arrayFilters) updateOpts.arrayFilters = o.arrayFilters;

    return Message.findOneAndUpdate(query, update, updateOpts).exec();
  }

  /**
   * Hard delete by id
   * @param {String|ObjectId} id
   * @param {Object} opts
   */
  async deleteById(id, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const q = Message.findByIdAndDelete(id);
    if (o.session) q.session(o.session);
    return q.exec();
  }

  /**
   * Soft delete by id
   * @param {String|ObjectId} id
   * @param {String|null} deletedBy
   * @param {Object} opts
   */
  async softDeleteById(id, deletedBy = null, opts = {}) {
    if (!id) throw createError(400, 'id is required');
    const o = normalizeOpts(opts);
    const update = { deleted: true, status: 'deleted' };
    if (deletedBy) update['metadata.deletedBy'] = deletedBy;
    const q = Message.findByIdAndUpdate(id, update, { new: true, session: o.session });
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Add an attachment (atomic push)
   * @param {String|ObjectId} messageId
   * @param {String|ObjectId} fileId
   * @param {Object} opts
   */
  async addAttachment(messageId, fileId, opts = {}) {
    if (!messageId || !fileId) throw createError(400, 'messageId and fileId are required');
    const o = normalizeOpts(opts);
    const update = { $push: { attachments: fileId } };
    const updateOpts = { new: !!o.new, session: o.session };
    const q = Message.findOneAndUpdate({ _id: messageId, deleted: false }, update, updateOpts);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Remove an attachment (atomic pull)
   * @param {String|ObjectId} messageId
   * @param {String|ObjectId} fileId
   * @param {Object} opts
   */
  async removeAttachment(messageId, fileId, opts = {}) {
    if (!messageId || !fileId) throw createError(400, 'messageId and fileId are required');
    const o = normalizeOpts(opts);
    const update = { $pull: { attachments: mongoose.Types.ObjectId(fileId) } };
    const updateOpts = { new: !!o.new, session: o.session };
    const q = Message.findOneAndUpdate({ _id: messageId, deleted: false }, update, updateOpts);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Add recipient user (atomic addToSet)
   * @param {String|ObjectId} messageId
   * @param {String|ObjectId} userId
   * @param {Object} opts
   */
  async addRecipient(messageId, userId, opts = {}) {
    if (!messageId || !userId) throw createError(400, 'messageId and userId are required');
    const o = normalizeOpts(opts);
    const update = { $addToSet: { 'recipients.users': mongoose.Types.ObjectId(userId) } };
    const updateOpts = { new: !!o.new, session: o.session };
    const q = Message.findOneAndUpdate({ _id: messageId, deleted: false }, update, updateOpts);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Remove recipient user (atomic pull)
   * @param {String|ObjectId} messageId
   * @param {String|ObjectId} userId
   * @param {Object} opts
   */
  async removeRecipient(messageId, userId, opts = {}) {
    if (!messageId || !userId) throw createError(400, 'messageId and userId are required');
    const o = normalizeOpts(opts);
    const update = { $pull: { 'recipients.users': mongoose.Types.ObjectId(userId) } };
    const updateOpts = { new: !!o.new, session: o.session };
    const q = Message.findOneAndUpdate({ _id: messageId, deleted: false }, update, updateOpts);
    if (o.select) q.select(o.select);
    if (o.populate) q.populate(o.populate);
    if (o.lean) q.lean();
    return q.exec();
  }

  /**
   * Mark message as read (non-atomic: load, mutate, save)
   * @param {String|ObjectId} messageId
   * @param {Object} opts
   */
  async markRead(messageId, opts = {}) {
    if (!messageId) throw createError(400, 'messageId is required');
    const o = normalizeOpts(opts);
    const docQuery = Message.findOne({ _id: messageId, deleted: false });
    if (o.session) docQuery.session(o.session);
    if (o.select) docQuery.select(o.select);
    if (o.populate) docQuery.populate(o.populate);
    if (o.lean) docQuery.lean();

    const msg = await docQuery.exec();
    if (!msg) throw createError(404, 'Message not found');

    // If lean, perform update via findOneAndUpdate
    if (o.lean) {
      return this.updateById(messageId, { $set: { status: 'read' } }, { ...opts, new: true });
    }

    if (msg.status !== 'read') {
      msg.status = 'read';
      if (o.session) await msg.save({ session: o.session });
      else await msg.save();
    }
    return msg;
  }

  /**
   * Mark message as unread
   * @param {String|ObjectId} messageId
   * @param {Object} opts
   */
  async markUnread(messageId, opts = {}) {
    if (!messageId) throw createError(400, 'messageId is required');
    const o = normalizeOpts(opts);
    const docQuery = Message.findOne({ _id: messageId, deleted: false });
    if (o.session) docQuery.session(o.session);
    if (o.select) docQuery.select(o.select);
    if (o.populate) docQuery.populate(o.populate);
    if (o.lean) docQuery.lean();

    const msg = await docQuery.exec();
    if (!msg) throw createError(404, 'Message not found');

    if (o.lean) {
      return this.updateById(messageId, { $set: { status: 'unread' } }, { ...opts, new: true });
    }

    if (msg.status !== 'unread') {
      msg.status = 'unread';
      if (o.session) await msg.save({ session: o.session });
      else await msg.save();
    }
    return msg;
  }

  /**
   * Find messages by filter (helper)
   * @param {Object} filter
   * @param {Object} opts
   */
  async findByFilter(filter = {}, opts = {}) {
    const o = normalizeOpts(opts);
    const baseFilter = { ...filter };
    if (!o.includeDeleted) baseFilter.deleted = false;
    let q = Message.find(baseFilter);
    if (o.select) q = q.select(o.select);
    if (o.populate) q = q.populate(o.populate);
    if (o.session) q = q.session(o.session);
    if (o.lean) q = q.lean();
    return q.exec();
  }
}

module.exports = new MessageRepo();
