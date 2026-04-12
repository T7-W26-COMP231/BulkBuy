// frontend/src/api/intentApi.js

import api from './api';

/**
 * Create a purchase intent — POST /api/ordrs
 */
export const createIntent = async (intentData) => {
  try {
    // 1. Check if user already has a draft order
    const existingRes = await api.get(`/ordrs/user/${intentData.userId}`);
    const allOrders = existingRes.data?.items || [];
    const existingDraft = allOrders.find(o => o.status === 'draft');

    if (existingDraft) {
      // 2. Add item to existing draft
      const response = await api.post(
        `/ordrs/${existingDraft._id}/add-item`,
        intentData.items[0]
      );
      return response.data;
    }

    // 3. No draft exists — create new order
    const response = await api.post('/ordrs', intentData);
    return response.data;

  } catch (error) {
    console.error('Error creating intent:', error);
    console.error('Backend error response:', error.response?.data);
    throw error;
  }
};

/**
 * Helper to build the payload expected by POST /api/ordrs
 */
export const buildIntentPayload = ({
  userId,
  productId,
  itemId,
  quantity,
  atInstantPrice,
  discountedPercentage = 0,
  discountBracket = { initial: 0, final: 0 },
  saveForLater = false,
  ops_region = null,
  metadata = {}
}) => {
  return {
    userId,
    items: [
      {
        productId,
        itemId,
        quantity,
        saveForLater,
        pricingSnapshot: {
          atInstantPrice,
          discountedPercentage,
          discountBracket
        }
      }
    ],
    status: 'draft',
    ...(ops_region ? { ops_region: Array.isArray(ops_region) ? ops_region[0] : ops_region } : {}), // ← only this line changed
    metadata: {
      source: 'confirm-intent',
      ...metadata
    }
  };
};

/**
 * Get all intents for a user
 * GET /api/ordrs/user/:userId
 */
export const getMyIntents = async (userId) => {
  try {
    //const response = await api.get(`/api/ordrs/user/${userId}`);
    const response = await api.get(`/ordrs/user/${userId}`);

    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching intents:', error);
    throw error;
  }
};

/**
 * Update the quantity of a specific item in an intent/order.
 *
 * Hits existing route:
 *   PATCH /api/ordrs/:orderId/update-item
 *   body: { itemId, changes: { quantity } }
 *
 * Throws with err.locked = true on a 423 (window closed).
 */
export const updateIntentItem = async (orderId, itemId, quantity) => {
  try {
    //    const response = await api.patch(`/api/ordrs/${orderId}/update-item`, {
    const response = await api.patch(`/ordrs/${orderId}/update-item`, {

      itemId,
      changes: { quantity }
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 423) {
      const err = new Error(
        error.response.data?.message || 'This window is locked. No changes are allowed.'
      );
      err.locked = true;
      throw err;
    }
    console.error('Error updating intent item:', error);
    throw error;
  }
};

/**
 * Remove a specific item from an intent/order.
 *
 * Hits existing route:
 *   DELETE /api/ordrs/:orderId/items/:itemId
 *
 * Throws with err.locked = true on a 423 (window closed).
 */
export const removeIntentItem = async (orderId, itemId) => {
  try {
    //const response = await api.delete(`/api/ordrs/${orderId}/items/${itemId}`);
    const response = await api.delete(`/ordrs/${orderId}/items/${itemId}`);

    return response.data;
  } catch (error) {
    if (error.response?.status === 423) {
      const err = new Error(
        error.response.data?.message || 'This window is locked. Items cannot be removed.'
      );
      err.locked = true;
      throw err;
    }
    console.error('Error removing intent item:', error);
    throw error;
  }
};