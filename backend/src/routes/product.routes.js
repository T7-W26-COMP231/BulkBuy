// src/routes/product.routes.js
const express = require('express');
const ProductController = require('../controllers/product.controller');
const productValidators = require('../validators/product.validators');

const router = express.Router();

/**
 * Async wrapper to forward errors to express error handler
 * @param {Function} fn async route handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Routes
 *
 * POST   /products                    -> create product
 * POST   /products/search             -> search products (body filters + pagination)
 * GET    /products/public-search      -> public product search (q, page, limit)
 * GET    /products                    -> list products (pagination/filter via query)
 * GET    /products/:id                -> get product by Mongo _id
 * GET    /products/by-item/:itemId    -> find products by itemId
 * PATCH  /products/:id                -> update product by _id
 * PATCH  /products                    -> update one by filter (body: { filter, update, opts })
 * DELETE /products/:id                -> soft-delete product by _id
 * POST   /products/:id/restore        -> restore soft-deleted product
 * DELETE /products/:id/hard           -> hard delete (admin)
 * POST   /products/bulk               -> bulk create products
 */

/* Create product */
router.post(
  '/',
  productValidators.create,
  asyncHandler(ProductController.createProduct)
);

/* Search products (body filters + pagination) */
router.post(
  '/search',
  productValidators.search,
  asyncHandler(ProductController.searchProducts)
);

/* Public search (query: q, page, limit, filters JSON) */
router.get(
  '/public-search',
  asyncHandler(ProductController.publicSearch)
);

/* List products (supports ?page=&limit=&filter= JSON) */
router.get(
  '/',
  productValidators.query,
  asyncHandler(ProductController.listProducts)
);

/* Get product by Mongo _id */
router.get(
  '/:id',
  productValidators.idParam,
  asyncHandler(ProductController.getProductById)
);

/* Find products by itemId */
router.get(
  '/by-item/:itemId',
  productValidators.itemIdParam,
  asyncHandler(ProductController.findByItemId)
);

/* Update product by _id (partial update) */
router.patch(
  '/:id',
  productValidators.idParam,
  productValidators.update,
  asyncHandler(ProductController.updateProductById)
);

/* Update one by filter: body { filter, update, opts } */
router.patch(
  '/',
  productValidators.updateOne,
  asyncHandler(ProductController.updateOne)
);

/* Soft delete product by _id */
router.delete(
  '/:id',
  productValidators.idParam,
  asyncHandler(ProductController.deleteProductById)
);

/* Restore soft-deleted product */
router.post(
  '/:id/restore',
  productValidators.idParam,
  asyncHandler(ProductController.restoreProductById)
);

/* Hard delete (admin) */
router.delete(
  '/:id/hard',
  productValidators.idParam,
  productValidators.adminOnly,
  asyncHandler(ProductController.hardDeleteById)
);

/* Bulk create products */
router.post(
  '/bulk',
  productValidators.bulkCreate,
  asyncHandler(ProductController.bulkCreate)
);

module.exports = router;
