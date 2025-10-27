// Simple in-memory rate limiter (for production, use Redis)
const requestCounts = new Map();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100; // per window per IP

/**
 * Rate limiting middleware
 * @param {Request} request - Incoming request
 * @returns {Object|null} - Error response if rate limited, null otherwise
 */
export function checkRateLimit(request) {
  const ip = request.headers.get('x-forwarded-for') || 
              request.headers.get('cf-connecting-ip') || 
              'unknown';
  
  const now = Date.now();
  const key = `${ip}`;
  
  // Get or initialize request data
  let requestData = requestCounts.get(key);
  
  if (!requestData || now - requestData.windowStart > WINDOW_MS) {
    // New window
    requestData = {
      count: 1,
      windowStart: now
    };
    requestCounts.set(key, requestData);
    return null;
  }
  
  // Increment count
  requestData.count++;
  
  // Check limit
  if (requestData.count > MAX_REQUESTS) {
    return {
      limited: true,
      retryAfter: Math.ceil((requestData.windowStart + WINDOW_MS - now) / 1000)
    };
  }
  
  return null;
}

/**
 * Cleanup old entries periodically
 */
export function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > WINDOW_MS) {
      requestCounts.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);
