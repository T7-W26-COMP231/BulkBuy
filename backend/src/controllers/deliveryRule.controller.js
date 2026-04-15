const DeliveryRuleService = require("../services/deliveryRule.service");

function actorFromReq(req = {}) {
    const user = req.user || null;
    return {
        userId: (user && (user.userId || user._id)) || null,
        role: (user && user.role) || null,
    };
}

async function createRule(req, res) {
    try {
        const data = await DeliveryRuleService.createRule(req.body || {}, {
            actor: actorFromReq(req),
            session: req.mongoSession,
        });

        return res.status(201).json({ success: true, data });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
}

async function listRules(req, res) {
    try {
        const result = await DeliveryRuleService.listRules(req.query || {}, {
            actor: actorFromReq(req),
        });

        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
}

async function updateRule(req, res) {
    try {
        const data = await DeliveryRuleService.updateRule(req.params.id, req.body || {}, {
            actor: actorFromReq(req),
            session: req.mongoSession,
        });

        return res.status(200).json({ success: true, data });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
}

async function deleteRule(req, res) {
    try {
        const data = await DeliveryRuleService.deleteRule(req.params.id, {
            actor: actorFromReq(req),
            session: req.mongoSession,
        });

        return res.status(200).json({ success: true, data });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
}

module.exports = {
    createRule,
    listRules,
    updateRule,
    deleteRule,
};