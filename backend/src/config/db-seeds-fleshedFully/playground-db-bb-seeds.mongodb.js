// MongoDB Playground - hash passwords then insert users
const bcrypt = require("bcrypt");

const brands = require("./brands.json");
const categories = require("./categories.json");
const warehouses = require("./warehouses.json");
const s3files = require("./s3files.json");
const users = require("./users_25.json");
const messages = require("./messages.json");
const reviews = require("./reviews.json");
const configs = require("./configs.json");
const items = require("./items.json");
const regionmaps = require("./regionmaps.json");
const products = require("./products.json");
const saleswindows = require("./saleswindows.json");
const supplies = require("./supplies.json");
const orders = require("./orders.json");
const aggregations = require("./aggregations.json");

// Choose DB
use("ops-db-bulkbuy+");

/* Insert reference collections first (unchanged) */
// db.getCollection("brands").insertMany(brands);
// db.getCollection("categories").insertMany(categories);
// db.getCollection("warehouses").insertMany(warehouses);
// db.getCollection("s3storedfiles").insertMany(s3files);
// db.getCollection("regionmaps").insertMany(regionmaps);

db.getCollection("messages").insertMany(messages);
// db.getCollection("reviews").insertMany(reviews);
// db.getCollection("configs").insertMany(configs);
// db.getCollection("items").insertMany(items);

// /* ------------------------------
// *Hash users then insert once 
// ---------------------------------*/
// (async () => {
//   try {
//     const saltRounds = 10;    const hashedUsers = [];
//     for (const u of users) {
//       // clone to avoid mutating original if you need it later
//       const doc = Object.assign({}, u);
//       if (doc.passwordHash && !/^\$2[aby]\$/.test(String(doc.passwordHash))) {
//         // await ensures hashing completes before pushing
//         doc.passwordHash = await bcrypt.hash(String(doc.passwordHash), saltRounds, );
//       }
//       hashedUsers.push(doc);
//     }
//     if (hashedUsers.length > 0) {
//       // single bulk insert
//       db.getCollection("users").insertMany(hashedUsers);
//       print(`Inserted ${hashedUsers.length} users with hashed passwords.`);
//     } else { print("No users to insert."); }
//   } catch (err) {
//     print("Error hashing or inserting users:", err && err.message ? err.message : err, );
//     throw err;
//   }
// })();


/*-----------------------------------------
// Run the above first and then these. 
// DO NOT RUN ALL AT ONCE
// Preferrably run the below one at a time.
-------------------------------------------*/

// db.getCollection("products").insertMany(products);
// db.getCollection("saleswindows").insertMany(saleswindows);
// db.getCollection("supplies").insertMany(supplies);
// db.getCollection("orders").insertMany(orders);
// db.getCollection("aggregations").insertMany(aggregations);