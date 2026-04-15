const mongoose = require("mongoose");
const { Schema } = mongoose;
const { generateDefaultIdStr, generateRandomId } = require("./generateDefaultIdStr");

function transformToJSON(doc, ret) {
    delete ret.__v;
    delete ret.deleted;
    return ret;
}

const RuleItemSchema = new Schema(
    {
        ruleId: { type: String, required: true, trim: true },
        ruleName: { type: String, required: true, trim: true },

        supplierId: { type: String, trim: true, default: "" },
        supplierName: { type: String, trim: true, default: "" },
        deliveryRegion: { type: String, trim: true, default: "" },

        warningAfterDays: { type: Number, required: true, min: 1, default: 5 },
        maxDeliveryDays: { type: Number, required: true, min: 1, default: 7 },

        isActive: { type: Boolean, default: true },
        notes: { type: String, trim: true, default: "" },
    },
    { _id: false }
);

const DeliveryRuleSchema = new Schema(
    {
        _id: { type: String, required: true, trim: true },
        createdBy: { type: String, required: true, trim: true, unique: true, index: true },

        rules: {
            type: [RuleItemSchema],
            default: [],
        },

        deleted: { type: Boolean, default: false, index: true },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true, versionKey: false, transform: transformToJSON },
        toObject: { virtuals: true },
    }
);

DeliveryRuleSchema.pre("validate", async function () {
    if (!this._id) {
        this._id = await generateDefaultIdStr(this, { length: 20 });
    }

    if (Array.isArray(this.rules)) {
        this.rules = this.rules.map((rule) => ({
            ...rule,
            ruleId: rule.ruleId || generateRandomId(12),
        }));
    }
});

module.exports =
    mongoose.models.DeliveryRule ||
    mongoose.model("DeliveryRule", DeliveryRuleSchema);