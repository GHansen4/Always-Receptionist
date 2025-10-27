/**
 * Shopify API Client Wrapper
 * Handles GraphQL requests with proper error handling
 */

/**
 * Make an authenticated GraphQL request to Shopify
 * @param {Object} session - Session object with shop and accessToken
 * @param {string} query - GraphQL query string
 * @param {Object} variables - Query variables (optional)
 * @returns {Promise<Object>} - GraphQL response data
 * @throws {Error} - Throws specific error types for different failures
 */
export async function shopifyGraphQL(session, query, variables = {}) {
  if (!session || !session.shop || !session.accessToken) {
    throw new Error('INVALID_SESSION');
  }
  
  const response = await fetch(
    `https://${session.shop}/admin/api/2024-10/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables })
    }
  );
  
  // Handle HTTP errors
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('SHOPIFY_AUTH_FAILED');
    }
    if (response.status === 429) {
      throw new Error('SHOPIFY_RATE_LIMITED');
    }
    throw new Error(`SHOPIFY_API_ERROR_${response.status}`);
  }
  
  const data = await response.json();
  
  // Handle GraphQL errors
  if (data.errors) {
    console.error('Shopify GraphQL errors:', data.errors);
    throw new Error('SHOPIFY_GRAPHQL_ERROR');
  }
  
  return data;
}

/**
 * Check if a Shopify API error indicates the app needs reinstallation
 * @param {Error} error - Error object
 * @returns {boolean}
 */
export function isReinstallRequired(error) {
  return error.message === 'SHOPIFY_AUTH_FAILED' || 
         error.message === 'INVALID_SESSION';
}

/**
 * Check if error is due to rate limiting
 * @param {Error} error - Error object
 * @returns {boolean}
 */
export function isRateLimited(error) {
  return error.message === 'SHOPIFY_RATE_LIMITED';
}

/**
 * Check if error is a GraphQL error
 * @param {Error} error - Error object
 * @returns {boolean}
 */
export function isGraphQLError(error) {
  return error.message === 'SHOPIFY_GRAPHQL_ERROR';
}
