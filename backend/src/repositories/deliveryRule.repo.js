const DeliveryRule = require("../models/deliveryRule.model");
const createError = require("http-errors");

class DeliveryRuleRepo {
    async create(payload = {}, opts = {}) {
        if (!payload || typeof payload !== "object") {
            throw createError(400, "payload is required");
        }

        if (opts.session) {
            const docs = await DeliveryRule.create([payload], { session: opts.session });
            return docs[0];
        }

        return DeliveryRule.create(payload);
    }

    async findById(id, opts = {}) {
        if (!id) throw createError(400, "id is required");

        const query = { _id: id };
        if (!opts.includeDeleted) query.deleted = false;

        let q = DeliveryRule.findOne(query);
        if (opts.session) q = q.session(opts.session);
        if (opts.lean) q = q.lean();

        return q.exec();
    }

    async findOneByCreatedBy(createdBy, opts = {}) {
        if (!createdBy) throw createError(400, "createdBy is required");

        const query = { createdBy };
        if (!opts.includeDeleted) query.deleted = false;

        let q = DeliveryRule.findOne(query);
        if (opts.session) q = q.session(opts.session);
        if (opts.lean) q = q.lean();

        return q.exec();
    }

    async paginate(filter = {}, opts = {}) {
        const page = parseInt(opts.page || 1, 10) || 1;
        const limit = parseInt(opts.limit || 10, 10) || 10;
        const skip = (page - 1) * limit;

        const baseFilter = { ...filter };
        if (!opts.includeDeleted) baseFilter.deleted = false;

        const [total, items] = await Promise.all([
            DeliveryRule.countDocuments(baseFilter),
            DeliveryRule.find(baseFilter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
        ]);

        return {
            items,
            total,
            page,
            limit,
            pages: Math.max(1, Math.ceil(total / limit)),
        };
    }

    async updateById(id, update = {}, opts = {}) {
        if (!id) throw createError(400, "id is required");

        const query = { _id: id };
        if (!opts.includeDeleted) query.deleted = false;

        let q = DeliveryRule.findOneAndUpdate(query, update, {
            new: true,
            runValidators: true,
            session: opts.session || null,
        });

        if (opts.lean) q = q.lean();
        return q.exec();
    }

    async softDeleteById(id, opts = {}) {
        if (!id) throw createError(400, "id is required");

        return DeliveryRule.findOneAndUpdate(
            { _id: id, deleted: false },
            { deleted: true },
            { new: true, session: opts.session || null }
        ).exec();
    }
}

module.exports = new DeliveryRuleRepo();