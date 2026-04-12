//This data for task city name changes then data relaoded but in future this needs to change


// src/data/mockData.js
// ─────────────────────────────────────────────────────────────────────────────
// All mock city data lives here. Import getCityData(cityName) wherever needed.
// Shape matches the real API response so swapping to a live API needs zero
// changes in HomePage – just delete this file and restore fetchAggregations.
// ─────────────────────────────────────────────────────────────────────────────

export const CITY_MOCK_DATA = {
    Toronto: {
        totalSavings: "$412.50",
        savingsLabel: "Saved this month in Toronto",
        aggregations: [
            {
                id: "tor-1",
                title: "Premium Organic Avocados",
                status: "OPEN",
                price: 1.25,
                closesIn: "2h 14m",
                soldUnits: 750,
                targetUnits: 1000,
                nextTierLabel: "Tier 3 ($1.10)",
                unitsToNextTier: 250,
                pickupLocation: "Toronto Central",
                pickupDetail: "St. Lawrence Market",
                estimatedSavings: "Save $0.65 per unit vs Retail",
                qualityLabel: "Grade A Organic Certified",
                imageUrl:
                    "https://lh3.googleusercontent.com/aida-public/AB6AXuAs5mRtJWYgicX4MpUHUxkozzsqxNYGZdf2dh0KbBVY6ymbmX9cEHyHEopXQmC5CPo0IAIh4Zq4Z1dTSAQg5mMn3vc2K_szU8u4vaYxzLCYK6IoHPmAwChr8oeJRy1cLxdXiVzSltoAKb9at-xfLehd3lVC1cvW5bTD3c1kdpmoYmVcDpsMrOQ8jONhajYH5ifXz6AJ0alLeJvvneQPquNecKzQDghsLMgjC72S4gltD8GwRNa30pHXy_5y4k3kH8WItjAopsJDxgI",
                participants: 145,
            },
        ],
    },

    Scarborough: {
        totalSavings: "$198.75",
        savingsLabel: "Saved this month in Scarborough",
        aggregations: [
            {
                id: "sca-1",
                title: "Jasmine Rice (10 kg Bags)",
                status: "OPEN",
                price: 12.50,
                closesIn: "1d 3h",
                soldUnits: 180,
                targetUnits: 300,
                nextTierLabel: "Tier 2 ($10.99)",
                unitsToNextTier: 120,
                pickupLocation: "Scarborough Town Centre",
                pickupDetail: "Scarborough Civic Centre Lot",
                estimatedSavings: "Save $3.50 per bag vs Retail",
                qualityLabel: "Premium Long Grain Certified",
                imageUrl: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&q=80",
                participants: 34,
            },
        ],
    },

    Mississauga: {
        totalSavings: "$326.00",
        savingsLabel: "Saved this month in Mississauga",
        aggregations: [
            {
                id: "mis-1",
                title: "Cold-Pressed Olive Oil (1 L)",
                status: "OPEN",
                price: 8.99,
                closesIn: "3h 45m",
                soldUnits: 420,
                targetUnits: 600,
                nextTierLabel: "Tier 3 ($7.49)",
                unitsToNextTier: 180,
                pickupLocation: "Square One Area",
                pickupDetail: "Square One Pickup Hub",
                estimatedSavings: "Save $3.01 per bottle vs Retail",
                qualityLabel: "Extra Virgin Cold Pressed",
                imageUrl: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&q=80",
                participants: 89,
            },
        ],
    },

    Brampton: {
        totalSavings: "$154.20",
        savingsLabel: "Saved this month in Brampton",
        aggregations: [
            {
                id: "bra-1",
                title: "Basmati Rice (5 kg Bags)",
                status: "OPEN",
                price: 9.50,
                closesIn: "6h 30m",
                soldUnits: 210,
                targetUnits: 400,
                nextTierLabel: "Tier 2 ($8.25)",
                unitsToNextTier: 190,
                pickupLocation: "Brampton Central",
                pickupDetail: "Bramalea City Centre Hub",
                estimatedSavings: "Save $2.50 per bag vs Retail",
                qualityLabel: "Premium Aged Basmati",
                imageUrl: "https://images.unsplash.com/photo-1610725664285-7c57e6eeac3f?w=800&q=80",
                participants: 47,
            },
        ],
    },

    Markham: {
        totalSavings: "$289.90",
        savingsLabel: "Saved this month in Markham",
        aggregations: [
            {
                id: "mar-1",
                title: "Wagyu Beef Bundles (2 kg)",
                status: "OPEN",
                price: 38.00,
                closesIn: "12h 00m",
                soldUnits: 55,
                targetUnits: 100,
                nextTierLabel: "Tier 2 ($32.00)",
                unitsToNextTier: 45,
                pickupLocation: "Markham Centre",
                pickupDetail: "Markham Civic Centre Lot",
                estimatedSavings: "Save $12.00 per bundle vs Retail",
                qualityLabel: "A5 Grade Wagyu Certified",
                imageUrl: "https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=800&q=80",
                participants: 21,
            },
        ],
    },

    Vaughan: {
        totalSavings: "$211.60",
        savingsLabel: "Saved this month in Vaughan",
        aggregations: [
            {
                id: "vau-1",
                title: "Organic Whole Milk (4 L)",
                status: "OPEN",
                price: 5.25,
                closesIn: "4h 20m",
                soldUnits: 340,
                targetUnits: 500,
                nextTierLabel: "Tier 2 ($4.50)",
                unitsToNextTier: 160,
                pickupLocation: "Vaughan Mills Area",
                pickupDetail: "Vaughan Metro Centre Hub",
                estimatedSavings: "Save $1.75 per jug vs Retail",
                qualityLabel: "Organic Ontario Dairy Certified",
                imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=800&q=80",
                participants: 73,
            },
        ],
    },

    "Richmond Hill": {
        totalSavings: "$178.30",
        savingsLabel: "Saved this month in Richmond Hill",
        aggregations: [
            {
                id: "ric-1",
                title: "Artisan Cheese Selection (1 kg)",
                status: "OPEN",
                price: 14.75,
                closesIn: "8h 15m",
                soldUnits: 130,
                targetUnits: 250,
                nextTierLabel: "Tier 2 ($12.50)",
                unitsToNextTier: 120,
                pickupLocation: "Richmond Hill Centre",
                pickupDetail: "Hillcrest Mall Pickup Point",
                estimatedSavings: "Save $5.25 per kg vs Retail",
                qualityLabel: "Artisan Small-Batch Certified",
                imageUrl: "https://images.unsplash.com/photo-1452195100486-9cc805987862?w=800&q=80",
                participants: 29,
            },
        ],
    },

    Oakville: {
        totalSavings: "$364.80",
        savingsLabel: "Saved this month in Oakville",
        aggregations: [
            {
                id: "oak-1",
                title: "Wild Sockeye Salmon (per kg)",
                status: "OPEN",
                price: 16.00,
                closesIn: "1h 55m",
                soldUnits: 88,
                targetUnits: 150,
                nextTierLabel: "Tier 2 ($13.50)",
                unitsToNextTier: 62,
                pickupLocation: "Oakville Central",
                pickupDetail: "Oakville Town Square Hub",
                estimatedSavings: "Save $6.00 per kg vs Retail",
                qualityLabel: "Wild-Caught MSC Certified",
                imageUrl: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80",
                participants: 38,
            },
        ],
    },

    Burlington: {
        totalSavings: "$142.50",
        savingsLabel: "Saved this month in Burlington",
        aggregations: [
            {
                id: "bur-1",
                title: "Local Wildflower Honey (500 g)",
                status: "OPEN",
                price: 7.50,
                closesIn: "2d 0h",
                soldUnits: 90,
                targetUnits: 200,
                nextTierLabel: "Tier 2 ($6.25)",
                unitsToNextTier: 110,
                pickupLocation: "Burlington Downtown",
                pickupDetail: "Spencer Smith Park Lot",
                estimatedSavings: "Save $2.50 per jar vs Retail",
                qualityLabel: "Raw Ontario Wildflower Honey",
                imageUrl: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&q=80",
                participants: 18,
            },
        ],
    },

    Pickering: {
        totalSavings: "$93.40",
        savingsLabel: "Saved this month in Pickering",
        aggregations: [
            {
                id: "pic-1",
                title: "Greenhouse Tomatoes (2 kg)",
                status: "OPEN",
                price: 4.50,
                closesIn: "9h 00m",
                soldUnits: 160,
                targetUnits: 300,
                nextTierLabel: "Tier 2 ($3.75)",
                unitsToNextTier: 140,
                pickupLocation: "Pickering Town Centre",
                pickupDetail: "Pickering GO Station Hub",
                estimatedSavings: "Save $1.50 per box vs Retail",
                qualityLabel: "Ontario Greenhouse Certified",
                imageUrl: "https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=800&q=80",
                participants: 41,
            },
        ],
    },

    Ajax: {
        totalSavings: "$117.60",
        savingsLabel: "Saved this month in Ajax",
        aggregations: [
            {
                id: "aja-1",
                title: "Organic Blueberries (1 pint)",
                status: "OPEN",
                price: 3.25,
                closesIn: "3h 10m",
                soldUnits: 220,
                targetUnits: 400,
                nextTierLabel: "Tier 2 ($2.75)",
                unitsToNextTier: 180,
                pickupLocation: "Ajax Central",
                pickupDetail: "Ajax Community Centre",
                estimatedSavings: "Save $1.25 per pint vs Retail",
                qualityLabel: "Certified Organic BC Grown",
                imageUrl: "https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=800&q=80",
                participants: 56,
            },
        ],
    },

    Whitby: {
        totalSavings: "$88.20",
        savingsLabel: "Saved this month in Whitby",
        aggregations: [
            {
                id: "whi-1",
                title: "Whole Grain Pasta (500 g)",
                status: "CLOSED",
                price: 2.10,
                closesIn: null,
                soldUnits: 600,
                targetUnits: 600,
                nextTierLabel: null,
                unitsToNextTier: 0,
                pickupLocation: "Whitby Downtown",
                pickupDetail: "Whitby GO Station Lot",
                estimatedSavings: "Save $0.90 per pack vs Retail",
                qualityLabel: "Non-GMO Whole Grain Verified",
                imageUrl: "https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=800&q=80",
                participants: 204,
            },
        ],
    },

    Oshawa: {
        totalSavings: "$76.50",
        savingsLabel: "Saved this month in Oshawa",
        aggregations: [
            {
                id: "osh-1",
                title: "Chicken Breast (per kg)",
                status: "OPEN",
                price: 6.99,
                closesIn: "7h 45m",
                soldUnits: 400,
                targetUnits: 700,
                nextTierLabel: "Tier 2 ($5.99)",
                unitsToNextTier: 300,
                pickupLocation: "Oshawa Centre",
                pickupDetail: "Oshawa GO Pickup Point",
                estimatedSavings: "Save $2.01 per kg vs Retail",
                qualityLabel: "Hormone-Free Ontario Raised",
                imageUrl: "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=800&q=80",
                participants: 93,
            },
        ],
    },

    Milton: {
        totalSavings: "$131.00",
        savingsLabel: "Saved this month in Milton",
        aggregations: [
            {
                id: "mil-1",
                title: "Almond Butter (500 g Jar)",
                status: "OPEN",
                price: 6.50,
                closesIn: "11h 20m",
                soldUnits: 75,
                targetUnits: 150,
                nextTierLabel: "Tier 2 ($5.50)",
                unitsToNextTier: 75,
                pickupLocation: "Milton District",
                pickupDetail: "Milton Sports Centre Hub",
                estimatedSavings: "Save $2.50 per jar vs Retail",
                qualityLabel: "Natural No-Additive Certified",
                imageUrl: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=800&q=80",
                participants: 22,
            },
        ],
    },

    Newmarket: {
        totalSavings: "$99.80",
        savingsLabel: "Saved this month in Newmarket",
        aggregations: [
            {
                id: "new-1",
                title: "Pure Maple Syrup (500 ml)",
                status: "OPEN",
                price: 8.25,
                closesIn: "1d 6h",
                soldUnits: 110,
                targetUnits: 200,
                nextTierLabel: "Tier 2 ($7.00)",
                unitsToNextTier: 90,
                pickupLocation: "Newmarket Downtown",
                pickupDetail: "Upper Canada Mall Hub",
                estimatedSavings: "Save $3.75 per bottle vs Retail",
                qualityLabel: "Pure Canadian Grade A Maple",
                imageUrl: "https://images.unsplash.com/photo-1552314971-d2feb3513949?q=80&w=661&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
                participants: 31,
            },
        ],
    },

    Aurora: {
        totalSavings: "$68.90",
        savingsLabel: "Saved this month in Aurora",
        aggregations: [
            {
                id: "aur-1",
                title: "Organic Mixed Greens (300 g)",
                status: "OPEN",
                price: 3.50,
                closesIn: "4h 40m",
                soldUnits: 145,
                targetUnits: 250,
                nextTierLabel: "Tier 2 ($2.99)",
                unitsToNextTier: 105,
                pickupLocation: "Aurora Downtown",
                pickupDetail: "Aurora Town Square Hub",
                estimatedSavings: "Save $1.50 per bag vs Retail",
                qualityLabel: "Certified Organic Local Grown",
                imageUrl: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=80",
                participants: 27,
            },
        ],
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Full city payload – falls back to Toronto if city not found */
export function getCityData(cityName) {
    return CITY_MOCK_DATA[cityName] ?? CITY_MOCK_DATA["Toronto"];
}

/** First (featured) aggregation for a city */
export function getFeaturedAggregation(cityName) {
    return getCityData(cityName).aggregations[0] ?? null;
}