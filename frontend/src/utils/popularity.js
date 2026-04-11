// src/utils/popularity.js

export function getPopularityScore(item) {
    if (!item) return 0;
    const ratingScore = (item.ratings?.avg || 0) * Math.log1p(item.ratings?.count || 0);
    const demandScore = (item.inventory?.reserved || 0) * 0.1;
    return ratingScore + demandScore;
}

export function flattenAndRankItems(products = [], regionCode = null) {
    if (!Array.isArray(products)) return [];

    const seen = new Set();
    const items = [];

    for (const product of products) {
        for (const item of product?.items || []) {
            // skip skeleton/incomplete items (like the empty i60 in your data)
            if (!item?.title || !item?.variants?.length) continue;
            // deduplicate — same itemId appears in multiple products in your API response
            if (seen.has(item.itemId)) continue;
            seen.add(item.itemId);
            // if regionCode passed, skip items from other regions
            if (regionCode && item.ops_region && item.ops_region !== regionCode) continue;

            items.push({
                ...item,
                productId: product.productId,
                windowId: product.windowId,
                window: product.window,
                _popularityScore: getPopularityScore(item),
            });
        }
    }

    return items.sort((a, b) => b._popularityScore - a._popularityScore);
}