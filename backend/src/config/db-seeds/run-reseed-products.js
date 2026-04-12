//Sahil ran and created this script to populate and update the product collection

require("dotenv").config({
    path: require("path").resolve(__dirname, "../../../.env")
});
require("../../models/item.model");

const mongoose = require("mongoose");
const seedProducts = require("./seed-db-models.products");

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Mongo connected");

        const items = await mongoose.model("Item").find({}, { _id: 1, sku: 1 }).lean();
        console.log(`📦 Found ${items.length} items`);

        const itemsMap = {};
        const itemsArray = [];
        items.forEach((item) => {
            itemsMap[item.sku] = item._id.toString();
            itemsArray.push(item._id.toString());
        });

        // Clear old products first
        await mongoose.connection.db.collection("products").deleteMany({});
        console.log("🗑️  Cleared existing products");

        const result = await seedProducts.run({
            force: true,
            deps: { items: itemsArray, itemsMap }
        });

        console.log("✅ Reseeded products:", result.created);
        process.exit(0);

    } catch (err) {
        console.error("❌ ERROR:", err);
        process.exit(1);
    }
})();