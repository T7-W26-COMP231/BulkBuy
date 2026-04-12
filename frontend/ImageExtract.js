

const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://t7w26comp231_db_user:aFFigM4niKGVmPFM@bulkbuy.dgiawvb.mongodb.net/"; // change if needed
const client = new MongoClient(uri);

async function extractData() {
    try {
        await client.connect();

        const db = client.db("bulkbuy");
        const collection = db.collection("items");

        const docs = await collection.find({}).toArray();

        const result = docs.flatMap(doc =>
            (doc.images || []).map(img => ({
                title: doc.title,
                imageUrl: img
            }))
        );

        console.log(result);

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

extractData();