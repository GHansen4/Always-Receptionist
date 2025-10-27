import crypto from "crypto";

/**
 * Validates VAPI request signature
 * @param {Request} request - The incoming request
 * @returns {boolean} True if valid
 */
export function validateVapiRequest(request) {
  const signature = request.headers.get("X-Vapi-Signature");
  const expectedSignature = process.env.VAPI_SECRET_TOKEN;
  
  // DEBUG LOGGING
  console.log('=== VAPI Auth Debug ===');
  console.log('Received signature:', signature);
  console.log('Expected signature:', expectedSignature);
  console.log('Signature exists:', !!signature);
  console.log('Expected exists:', !!expectedSignature);
  console.log('Signature length:', signature?.length);
  console.log('Expected length:', expectedSignature?.length);
  
  if (!signature || !expectedSignature) {
    console.log('❌ Missing signature or token');
    return false;
  }
  
  if (signature.length !== expectedSignature.length) {
    console.log('❌ Length mismatch');
    return false;
  }
  
  try {
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (sigBuffer.length !== expectedBuffer.length) {
      console.log('❌ Buffer length mismatch');
      return false;
    }
    
    const isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    console.log('✅ Validation result:', isValid);
    return isValid;
  } catch (error) {
    console.error("❌ Signature validation error:", error);
    return false;
  }
}

/**
 * Validates Shopify shop parameter format
 * @param {string} shop - Shop domain
 * @returns {boolean} - Whether the shop format is valid
 */
export function validateShopFormat(shop) {
  if (!shop || typeof shop !== 'string') {
    return false;
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

/**
 * Creates an error response with proper headers
 * @param {string} error - Error message
 * @param {number} status - HTTP status code
 * @returns {Response} - Error response
 */
export function createErrorResponse(error, status = 500) {
  return new Response(
    JSON.stringify({ 
      error,
      timestamp: new Date().toISOString()
    }),
    { 
      status, 
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff"
      } 
    }
  );
}

/**
 * Creates a success response with security headers
 * @param {Object} data - Response data
 * @returns {Response} - Success response
 */
export function createSuccessResponse(data) {
  return new Response(
    JSON.stringify(data),
    { 
      status: 200, 
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY"
      } 
    }
  );
}

/**
 * Logs API requests for monitoring and debugging
 * @param {string} endpoint - API endpoint called
 * @param {Object} details - Request details
 */
export function logApiRequest(endpoint, details) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    endpoint,
    ...details
  };
  
  // In production, send to your logging service (e.g., Datadog, LogRocket)
  console.log('[VAPI API Request]', JSON.stringify(logEntry));
}

/**
 * Logs API errors for monitoring
 * @param {string} endpoint - API endpoint where error occurred
 * @param {Error|string} error - Error object or message
 * @param {Object} context - Additional context
 */
export function logApiError(endpoint, error, context = {}) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    endpoint,
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    ...context
  };
  
  // In production, send to your error tracking service (e.g., Sentry)
  console.error('[VAPI API Error]', JSON.stringify(errorLog));
}

/**
 * Sanitizes shop domain to prevent injection
 * @param {string} shop - Shop domain
 * @returns {string} - Sanitized shop domain
 */
export function sanitizeShop(shop) {
  if (!shop) return '';
  return shop.trim().toLowerCase();
}

/**
 * Checks if session is valid and not expired
 * @param {Object} session - Session object from database
 * @returns {boolean} - Whether session is valid
 */
export function isSessionValid(session) {
  if (!session) return false;
  if (!session.accessToken) return false;
  if (!session.expires) return true; // Offline token
  return new Date(session.expires) > new Date();
}

/**
 * Gets the Shopify API version to use
 * @returns {string} - API version string
 */
export function getShopifyApiVersion() {
  // Use environment variable if set, otherwise use stable version
  return process.env.SHOPIFY_API_VERSION || "2024-01";
}

/**
 * Builds Shopify GraphQL endpoint URL
 * @param {string} shop - Shop domain
 * @returns {string} - Full GraphQL endpoint URL
 */
export function buildShopifyGraphQLUrl(shop) {
  const apiVersion = getShopifyApiVersion();
  return `https://${shop}/admin/api/${apiVersion}/graphql.json`;
}