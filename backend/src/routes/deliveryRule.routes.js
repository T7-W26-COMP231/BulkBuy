const express = require("express");
const router = express.Router();

const DeliveryRuleController = require("../controllers/deliveryRule.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

router.post("/", requireAuth, asyncHandler(DeliveryRuleController.createRule));
router.get("/", requireAuth, asyncHandler(DeliveryRuleController.listRules));
router.patch("/:id", requireAuth, asyncHandler(DeliveryRuleController.updateRule));
router.post("/:id/soft-delete", requireAuth, asyncHandler(DeliveryRuleController.deleteRule));

module.exports = router;