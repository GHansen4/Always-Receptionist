/**
 * VAPI Function Calling Endpoint
 *
 * Three-Tier Architecture:
 * 1. Function Calling Layer - Handles VAPI function calls
 * 2. Shop Resolution Layer - Maps assistantId → shop_domain
 * 3. OAuth Session Layer - Retrieves access tokens
 * 4. Shopify GraphQL API - Fetches data
 *
 * Supported Functions:
 * - get_products: List available products
 * - search_products: Search products by keyword
 * - check_order_status: Look up order information
 */

import prisma from "../db.server";
import {
  getProducts,
  searchProducts,
  getOrderStatus
} from "../utils/shopify-admin-graphql.server";

/**
 * POST handler for VAPI function calls
 */
export async function action({ request }) {
  console.log('=== VAPI Functions API Request ===');

  try {
    // Step 1: Parse incoming request
    const body = await request.json();
    console.log('Request Body:', JSON.stringify(body, null, 2));

    // Extract function call details
    const toolCall = body?.message?.toolCallList?.[0];
    const toolCallId = toolCall?.id;
    const functionName = toolCall?.function?.name;
    const functionArgs = toolCall?.function?.arguments;

    console.log('Function Call:', {
      toolCallId,
      functionName,
      arguments: functionArgs
    });

    if (!toolCallId || !functionName) {
      return createErrorResponse('Missing function call information', null);
    }

    // Step 2: Authentication - Validate X-Vapi-Signature header
    const signature = request.headers.get("X-Vapi-Signature");
    console.log('Signature:', signature ? 'Present' : 'Missing');

    if (!signature) {
      return createErrorResponse('Missing authentication header', toolCallId, 401);
    }

    // Step 3: Shop Resolution - Map signature → shop_domain
    console.log('Looking up shop by signature...');
    const vapiConfig = await prisma.vapiConfig.findUnique({
      where: { vapiSignature: signature }
    });

    if (!vapiConfig) {
      console.log('VapiConfig not found');
      return createErrorResponse('Invalid authentication signature', toolCallId, 401);
    }

    const shop = vapiConfig.shop;
    console.log('Resolved Shop:', shop);

    // Step 4: OAuth Session - Retrieve access token
    console.log('Fetching OAuth session...');
    const sessionId = `offline_${shop}`;
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    });

    if (!session || !session.accessToken) {
      console.log('Session not found or missing access token');
      return createErrorResponse('Store not connected to Shopify', toolCallId, 401);
    }

    console.log('Session found with access token');

    // Step 5: Execute the requested function
    console.log(`Executing function: ${functionName}`);
    let result;

    switch (functionName) {
      case 'get_products':
        result = await handleGetProducts(session, functionArgs);
        break;

      case 'search_products':
        result = await handleSearchProducts(session, functionArgs);
        break;

      case 'check_order_status':
        result = await handleCheckOrderStatus(session, functionArgs);
        break;

      default:
        return createErrorResponse(
          `Unknown function: ${functionName}`,
          toolCallId,
          400
        );
    }

    // Step 6: Return formatted response
    console.log('Function executed successfully');
    return createSuccessResponse(result, toolCallId);

  } catch (error) {
    console.error('=== VAPI Functions API ERROR ===');
    console.error('Error:', error);

    // Try to extract toolCallId for error response
    let toolCallId = 'unknown';
    try {
      const body = await request.clone().json();
      toolCallId = body?.message?.toolCallList?.[0]?.id || 'unknown';
    } catch (parseError) {
      console.error('Failed to parse request for error response');
    }

    return createErrorResponse(error.message, toolCallId, 500);
  }
}

/**
 * Handler: get_products
 * Lists available products from the store
 */
async function handleGetProducts(session, args) {
  console.log('handleGetProducts called with args:', args);

  const limit = args?.limit || 10;
  const products = await getProducts(session, { limit });

  if (!products || products.length === 0) {
    return "No products found in the store";
  }

  // Format products for AI response
  const productList = products.map((p, i) =>
    `${i + 1}. ${p.title} - $${p.price} (${p.inventory} in stock)`
  ).join('. ');

  return `Here are our available products: ${productList}`;
}

/**
 * Handler: search_products
 * Searches products by keyword
 */
async function handleSearchProducts(session, args) {
  console.log('handleSearchProducts called with args:', args);

  const query = args?.query || args?.keyword || '';

  if (!query) {
    return "Please provide a search term";
  }

  const products = await searchProducts(session, { query });

  if (!products || products.length === 0) {
    return `No products found matching "${query}"`;
  }

  // Format search results for AI
  const productList = products.map((p, i) =>
    `${i + 1}. ${p.title} - $${p.price} (${p.inventory} in stock)${p.description ? ` - ${p.description}` : ''}`
  ).join('. ');

  return `I found ${products.length} product(s) matching "${query}": ${productList}`;
}

/**
 * Handler: check_order_status
 * Looks up order information by order number or email
 */
async function handleCheckOrderStatus(session, args) {
  console.log('handleCheckOrderStatus called with args:', args);

  const orderNumber = args?.orderNumber || args?.order_number;
  const email = args?.email;

  if (!orderNumber && !email) {
    return "Please provide either an order number or email address";
  }

  const order = await getOrderStatus(session, { orderNumber, email });

  if (!order) {
    return orderNumber
      ? `Order ${orderNumber} not found`
      : `No orders found for ${email}`;
  }

  // Format order info for AI
  const orderInfo = [
    `Order ${order.name}`,
    `Status: ${order.displayFulfillmentStatus}`,
    `Total: $${order.totalPrice}`,
    order.createdAt ? `Placed on ${new Date(order.createdAt).toLocaleDateString()}` : ''
  ].filter(Boolean).join(', ');

  return orderInfo;
}

/**
 * Helper: Create success response
 */
function createSuccessResponse(result, toolCallId) {
  return Response.json({
    results: [{
      toolCallId,
      result
    }]
  });
}

/**
 * Helper: Create error response
 */
function createErrorResponse(message, toolCallId, status = 500) {
  return Response.json({
    results: [{
      toolCallId: toolCallId || 'unknown',
      result: `Error: ${message}`
    }]
  }, { status });
}
