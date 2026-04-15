const createError = require("http-errors");
const DeliveryRuleRepo = require("../repositories/deliveryRule.repo");
const { generateRandomId } = require("../models/generateDefaultIdStr");

class DeliveryRuleService {
    async createRule(payload = {}, opts = {}) {
        const actor = opts.actor || {};
        if (!actor.userId) throw createError(401, "Unauthorized");

        if (!payload.ruleName || !String(payload.ruleName).trim()) {
            throw createError(400, "ruleName is required");
        }

        const warningAfterDays = Number(payload.warningAfterDays);
        const maxDeliveryDays = Number(payload.maxDeliveryDays);

        if (!Number.isFinite(warningAfterDays) || warningAfterDays < 1) {
            throw createError(400, "warningAfterDays must be at least 1");
        }

        if (!Number.isFinite(maxDeliveryDays) || maxDeliveryDays <= warningAfterDays) {
            throw createError(400, "maxDeliveryDays must be greater than warningAfterDays");
        }

        const supplierId = String(payload.supplierId || "").trim();
        const deliveryRegion = String(payload.deliveryRegion || "").trim();

        // find one admin document
        let existingDoc = await DeliveryRuleRepo.findOneByCreatedBy(actor.userId, {
            lean: false,
            includeDeleted: false,
        });

        // create admin document if missing
        if (!existingDoc) {
            existingDoc = await DeliveryRuleRepo.create(
                {
                    createdBy: actor.userId,
                    rules: [],
                },
                opts
            );
        }

        const nextRule = {
            ruleId: generateRandomId(12),
            ruleName: String(payload.ruleName).trim(),
            supplierId,
            supplierName: String(payload.supplierName || "").trim(),
            deliveryRegion,
            warningAfterDays,
            maxDeliveryDays,
            isActive: payload.isActive !== false,
            notes: String(payload.notes || "").trim(),
        };

        const existingRuleIndex = Array.isArray(existingDoc.rules)
            ? existingDoc.rules.findIndex(
                (rule) =>
                    String(rule.supplierId || "") === supplierId &&
                    String(rule.deliveryRegion || "") === deliveryRegion
            )
            : -1;

        if (existingRuleIndex >= 0) {
            // update matching rule instead of creating duplicate
            nextRule.ruleId = existingDoc.rules[existingRuleIndex].ruleId;
            existingDoc.rules[existingRuleIndex] = nextRule;
        } else {
            // add new rule
            existingDoc.rules.push(nextRule);
        }

        await existingDoc.save();

        return existingDoc;
    }

    async listRules(query = {}, opts = {}) {
        const actor = opts.actor || {};
        if (!actor.userId) throw createError(401, "Unauthorized");

        const existingDoc = await DeliveryRuleRepo.findOneByCreatedBy(actor.userId, {
            lean: true,
            includeDeleted: false,
        });

        if (!existingDoc) {
            return {
                items: [],
                total: 0,
                page: 1,
                limit: 10,
                pages: 1,
            };
        }

        let rules = Array.isArray(existingDoc.rules) ? [...existingDoc.rules] : [];

        if (query.supplierId) {
            rules = rules.filter(
                (rule) => String(rule.supplierId || "") === String(query.supplierId)
            );
        }

        if (query.deliveryRegion) {
            rules = rules.filter(
                (rule) =>
                    String(rule.deliveryRegion || "") === String(query.deliveryRegion)
            );
        }

        if (query.isActive === "true") {
            rules = rules.filter((rule) => rule.isActive === true);
        }

        if (query.isActive === "false") {
            rules = rules.filter((rule) => rule.isActive === false);
        }

        const page = parseInt(query.page || 1, 10) || 1;
        const limit = parseInt(query.limit || 10, 10) || 10;
        const total = rules.length;
        const pages = Math.max(1, Math.ceil(total / limit));
        const start = (page - 1) * limit;
        const items = rules.slice(start, start + limit);

        return {
            items,
            total,
            page,
            limit,
            pages,
        };
    }

    async updateRule(ruleId, payload = {}, opts = {}) {
        const actor = opts.actor || {};
        if (!actor.userId) throw createError(401, "Unauthorized");

        const existingDoc = await DeliveryRuleRepo.findOneByCreatedBy(actor.userId, {
            lean: false,
            includeDeleted: false,
        });

        if (!existingDoc) throw createError(404, "Delivery rule document not found");

        const ruleIndex = Array.isArray(existingDoc.rules)
            ? existingDoc.rules.findIndex((rule) => rule.ruleId === ruleId)
            : -1;

        if (ruleIndex < 0) throw createError(404, "Delivery rule not found");

        const existingRule = existingDoc.rules[ruleIndex];

        const updatedRule = {
            ...existingRule.toObject?.() || existingRule,
        };

        if (payload.ruleName !== undefined) updatedRule.ruleName = String(payload.ruleName).trim();
        if (payload.supplierId !== undefined) updatedRule.supplierId = String(payload.supplierId).trim();
        if (payload.supplierName !== undefined) updatedRule.supplierName = String(payload.supplierName).trim();
        if (payload.deliveryRegion !== undefined) updatedRule.deliveryRegion = String(payload.deliveryRegion).trim();
        if (payload.notes !== undefined) updatedRule.notes = String(payload.notes).trim();
        if (payload.isActive !== undefined) updatedRule.isActive = !!payload.isActive;

        if (payload.warningAfterDays !== undefined) {
            const val = Number(payload.warningAfterDays);
            if (!Number.isFinite(val) || val < 1) {
                throw createError(400, "warningAfterDays must be at least 1");
            }
            updatedRule.warningAfterDays = val;
        }

        if (payload.maxDeliveryDays !== undefined) {
            const val = Number(payload.maxDeliveryDays);
            if (!Number.isFinite(val) || val < 1) {
                throw createError(400, "maxDeliveryDays must be at least 1");
            }
            updatedRule.maxDeliveryDays = val;
        }

        if (Number(updatedRule.maxDeliveryDays) <= Number(updatedRule.warningAfterDays)) {
            throw createError(400, "maxDeliveryDays must be greater than warningAfterDays");
        }

        existingDoc.rules[ruleIndex] = updatedRule;
        await existingDoc.save();

        return updatedRule;
    }

    async deleteRule(ruleId, opts = {}) {
        const actor = opts.actor || {};
        if (!actor.userId) throw createError(401, "Unauthorized");

        const existingDoc = await DeliveryRuleRepo.findOneByCreatedBy(actor.userId, {
            lean: false,
            includeDeleted: false,
        });

        if (!existingDoc) throw createError(404, "Delivery rule document not found");

        const ruleIndex = Array.isArray(existingDoc.rules)
            ? existingDoc.rules.findIndex((rule) => rule.ruleId === ruleId)
            : -1;

        if (ruleIndex < 0) throw createError(404, "Delivery rule not found");

        existingDoc.rules.splice(ruleIndex, 1);
        await existingDoc.save();

        return { success: true, ruleId };
    }
}

module.exports = new DeliveryRuleService();