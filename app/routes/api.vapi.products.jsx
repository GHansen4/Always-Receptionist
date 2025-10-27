import { createPrismaClient } from "../db.server";
import { 
  validateVapiRequest, 
  validateShopFormat, 
  createErrorResponse, 
  createSuccessResponse,
  logApiRequest,
  logApiError,
  sanitizeShop,
  isSessionValid
} from "~/utils/vapi-auth.server";
import { checkRateLimit } from "~/utils/rate-limit.server";
import { 
  shopifyGraphQL, 
  isReinstallRequired, 
  isRateLimited,
  isGraphQLError
} from "~/utils/shopify-client.server";

export async function action({ request }) {
  // DEBUG: Check environment variables at runtime
  console.log('=== RUNTIME ENV CHECK ===');
  console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
  console.log('DATABASE_URL_CUSTOM exists:', !!process.env.DATABASE_URL_CUSTOM);
  console.log('DATABASE_URL first 30 chars:', process.env.DATABASE_URL?.substring(0, 30));
  console.log('DATABASE_URL_CUSTOM first 30 chars:', process.env.DATABASE_URL_CUSTOM?.substring(0, 30));
  console.log('NODE_ENV:', process.env.NODE_ENV);
  
  const db = createPrismaClient(); // Create HERE, not at module level
  
  try {
    const startTime = Date.now();
    const url = new URL(request.url);
    const shop = sanitizeShop(url.searchParams.get("shop"));
    const search = url.searchParams.get("search") || "";
    
    // ============================================
    // STEP 1: Rate Limiting
    // ============================================
  const rateLimit = checkRateLimit(request);
  if (rateLimit?.limited) {
    logApiRequest('products', {
      shop,
      status: 'rate_limited',
      duration: Date.now() - startTime
    });
    
    return new Response(
      JSON.stringify({ 
        error: "Too many requests. Please try again later.",
        retryAfter: rateLimit.retryAfter
      }),
      { 
        status: 429,
        headers: { 
          "Content-Type": "application/json",
          "Retry-After": rateLimit.retryAfter.toString(),
          "X-RateLimit-Limit": "100",
          "X-RateLimit-Remaining": "0"
        } 
      }
    );
  }
  
  // ============================================
  // STEP 2: Authenticate VAPI Request
  // ============================================
  // NOTE: This is an external API endpoint called by VAPI, not an embedded
  // Shopify admin route. We authenticate VAPI's request and use stored OAuth
  // tokens to access Shopify's API. Using authenticate.admin() would be
  // incorrect as this is not a Shopify-initiated request.
  if (!validateVapiRequest(request)) {
    logApiRequest('products', {
      shop,
      status: 'unauthorized',
      reason: 'invalid_vapi_signature',
      duration: Date.now() - startTime
    });
    
    return createErrorResponse("Unauthorized - Invalid VAPI signature", 401);
  }
  
  // ============================================
  // STEP 3: Validate Parameters
  // ============================================
  if (!shop) {
    logApiRequest('products', {
      status: 'bad_request',
      reason: 'missing_shop',
      duration: Date.now() - startTime
    });
    
    return createErrorResponse("Shop parameter required", 400);
  }
  
  if (!validateShopFormat(shop)) {
    logApiRequest('products', {
      shop,
      status: 'bad_request',
      reason: 'invalid_shop_format',
      duration: Date.now() - startTime
    });
    
    return createErrorResponse("Invalid shop format. Must be *.myshopify.com", 400);
  }
  
  try {
    // ============================================
    // STEP 4: Get Valid Shopify Session
    // ============================================
    const session = await db.session.findFirst({
      where: { 
        shop,
        expires: { gt: new Date() }
      }
    });
    
    if (!session || !isSessionValid(session)) {
      logApiRequest('products', {
        shop,
        status: 'not_found',
        reason: 'session_not_found_or_expired',
        duration: Date.now() - startTime
      });
      
      return createErrorResponse(
        "Shop not found or session expired. Please reinstall the app.", 
        404
      );
    }
    
    // ============================================
    // STEP 5: Call Shopify API using wrapper
    // ============================================
    const data = await shopifyGraphQL(
      session,
      `
        query getProducts($query: String) {
          products(first: 10, query: $query) {
            edges {
              node {
                id
                title
                description
                priceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
                variants(first: 5) {
                  edges {
                    node {
                      id
                      title
                      price
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { query: search }
    );
    
    // ============================================
    // STEP 6: Success - Log and Return
    // ============================================
    const productCount = data.data?.products?.edges?.length || 0;
    
    logApiRequest('products', {
      shop,
      search,
      status: 'success',
      productCount,
      duration: Date.now() - startTime
    });
    
    return createSuccessResponse(data);
    
  } catch (error) {
    logApiError('products', error, {
      shop,
      search,
      duration: Date.now() - startTime
    });
    
    // ============================================
    // STEP 7: Handle Specific Error Types
    // ============================================
    
    if (isReinstallRequired(error)) {
      return createErrorResponse(
        "Shopify authentication failed. The app may need to be reinstalled.", 
        401
      );
    }
    
    if (isRateLimited(error)) {
      return createErrorResponse(
        "Shopify API rate limit exceeded. Please try again later.", 
        429
      );
    }
    
    if (isGraphQLError(error)) {
      return createErrorResponse(
        "Failed to query products from Shopify", 
        500
      );
    }
    
    // Generic error
    return createErrorResponse("Internal server error", 500);
  }
  } finally {
    await db.$disconnect();
  }
}