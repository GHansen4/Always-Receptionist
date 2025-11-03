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
  const requestId = Math.random().toString(36).substring(7);
  console.log('=== VAPI Functions API Request ===');
  console.log('Request ID:', requestId);
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', request.method);
  console.log('URL:', request.url);

  try {
    // Environment check
    console.log('Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_CONNECTED: !!prisma,
    });

    // Step 1: Parse incoming request
    console.log('Step 1: Parsing request body...');
    const body = await request.json();
    console.log('Message type:', body?.message?.type);
    console.log('Full request body:', JSON.stringify(body, null, 2));

    // VAPI can send toolCalls OR toolCallList - check both
    console.log('Checking tool call formats...');
    console.log('  toolCalls:', JSON.stringify(body?.message?.toolCalls, null, 2));
    console.log('  toolCallList:', JSON.stringify(body?.message?.toolCallList, null, 2));

    // Extract function call details - try both formats
    const toolCall = body?.message?.toolCallList?.[0] ||
                     body?.message?.toolCalls?.[0] ||
                     body?.message?.tool_calls?.[0];
    const toolCallId = toolCall?.id;
    const functionName = toolCall?.function?.name;
    const functionArgs = toolCall?.function?.arguments;

    console.log('Function call details:', {
      toolCallId,
      functionName,
      arguments: functionArgs
    });

    if (!toolCallId || !functionName) {
      console.error('❌ Missing function call information');
      console.error('toolCallId:', toolCallId);
      console.error('functionName:', functionName);
      console.error('Full body:', JSON.stringify(body, null, 2));
      return createErrorResponse('Missing function call information', null);
    }

    // Step 2: Authentication - Check both X-Vapi-Secret AND X-Vapi-Signature
    console.log('Step 2: Checking authentication...');
    const signature = request.headers.get("X-Vapi-Secret") ||
                      request.headers.get("X-Vapi-Signature");
    console.log('Signature present:', !!signature);
    if (signature) {
      console.log('Signature (first 20 chars):', signature.substring(0, 20) + '...');
    }

    if (!signature) {
      console.error('❌ Missing X-Vapi-Secret or X-Vapi-Signature header');
      console.error('Available headers:', [...request.headers.keys()].join(', '));
      return createErrorResponse('Missing authentication header', toolCallId, 401);
    }

    // Step 3: Shop Resolution - Map signature → shop_domain
    console.log('Step 3: Looking up shop by signature...');
    const vapiConfig = await prisma.vapiConfig.findUnique({
      where: { vapiSignature: signature }
    });

    if (!vapiConfig) {
      console.error('❌ VapiConfig not found for signature');
      console.error('Signature used:', signature.substring(0, 20) + '...');
      return createErrorResponse('Invalid authentication signature', toolCallId, 401);
    }

    const shop = vapiConfig.shop;
    console.log('✅ Shop resolved:', shop);
    console.log('Assistant ID:', vapiConfig.assistantId);

    // Step 4: OAuth Session - Retrieve access token
    console.log('Step 4: Fetching OAuth session...');
    const sessionId = `offline_${shop}`;
    console.log('Looking for session ID:', sessionId);

    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    });

    if (!session || !session.accessToken) {
      console.error('❌ Session not found or missing access token');
      console.error('Session exists:', !!session);
      console.error('Has access token:', !!session?.accessToken);
      return createErrorResponse('Store not connected to Shopify', toolCallId, 401);
    }

    console.log('✅ Session found with access token');
    console.log('Session shop:', session.shop);
    console.log('Token scope:', session.scope);

    // Safety check: ensure session has required fields
    if (!session.shop || !session.accessToken) {
      console.error('❌ Session is missing required fields');
      console.error('Has shop:', !!session.shop);
      console.error('Has accessToken:', !!session.accessToken);
      return createErrorResponse('Session is invalid or incomplete', toolCallId, 500);
    }

    // Step 5: Execute the requested function
    console.log(`Step 5: Executing function: ${functionName}`);
    console.log('Function arguments:', JSON.stringify(functionArgs, null, 2));

    let result;
    const startTime = Date.now();

    switch (functionName) {
      case 'get_products':
        console.log('→ Calling handleGetProducts');
        result = await handleGetProducts(session, functionArgs);
        break;

      case 'search_products':
        console.log('→ Calling handleSearchProducts');
        result = await handleSearchProducts(session, functionArgs);
        break;

      case 'check_order_status':
        console.log('→ Calling handleCheckOrderStatus');
        result = await handleCheckOrderStatus(session, functionArgs);
        break;

      default:
        console.error('❌ Unknown function:', functionName);
        return createErrorResponse(
          `Unknown function: ${functionName}`,
          toolCallId,
          400
        );
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Function executed successfully in ${executionTime}ms`);
    console.log('Result preview:', result.substring(0, 100) + '...');

    // Step 6: Return formatted response
    console.log('Step 6: Sending response...');
    console.log('=== VAPI Functions API Request COMPLETED ===');
    console.log('Request ID:', requestId);
    console.log('Total time:', executionTime + 'ms');

    return createSuccessResponse(result, toolCallId);

  } catch (error) {
    console.error('=== VAPI Functions API ERROR ===');
    console.error('Request ID:', requestId);
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    // Try to extract toolCallId for error response
    let toolCallId = 'unknown';
    try {
      const body = await request.clone().json();
      toolCallId = body?.message?.toolCallList?.[0]?.id ||
                   body?.message?.toolCalls?.[0]?.id ||
                   body?.message?.tool_calls?.[0]?.id ||
                   'unknown';
    } catch (parseError) {
      console.error('Failed to parse request for error response:', parseError.message);
    }

    return createErrorResponse(error.message, toolCallId, 500);
  }
}

/**
 * Handler: get_products
 * Lists available products from the store
 */
async function handleGetProducts(session, args) {
  console.log('→ handleGetProducts called');
  console.log('  Arguments:', args);

  const limit = args?.limit || 10;
  console.log(`  Fetching ${limit} products from Shopify...`);

  const products = await getProducts(session, { limit });
  console.log(`  Retrieved ${products?.length || 0} products`);

  if (!products || products.length === 0) {
    console.log('  ⚠️ No products found');
    return "No products found in the store";
  }

  // Format products for AI response
  const productList = products.map((p, i) =>
    `${i + 1}. ${p.title} - $${p.price} (${p.inventory} in stock)`
  ).join('. ');

  console.log('  ✅ Products formatted for AI response');
  return `Here are our available products: ${productList}`;
}

/**
 * Handler: search_products
 * Searches products by keyword
 */
async function handleSearchProducts(session, args) {
  console.log('→ handleSearchProducts called');
  console.log('  Arguments:', args);

  const query = args?.query || args?.keyword || '';
  console.log(`  Search query: "${query}"`);

  if (!query) {
    console.log('  ⚠️ No search query provided');
    return "Please provide a search term";
  }

  console.log(`  Searching Shopify for: "${query}"...`);
  const products = await searchProducts(session, { query });
  console.log(`  Found ${products?.length || 0} matching products`);

  if (!products || products.length === 0) {
    console.log('  ⚠️ No matching products found');
    return `No products found matching "${query}"`;
  }

  // Format search results for AI
  const productList = products.map((p, i) =>
    `${i + 1}. ${p.title} - $${p.price} (${p.inventory} in stock)${p.description ? ` - ${p.description}` : ''}`
  ).join('. ');

  console.log('  ✅ Search results formatted for AI response');
  return `I found ${products.length} product(s) matching "${query}": ${productList}`;
}

/**
 * Handler: check_order_status
 * Looks up order information by order number or email
 */
async function handleCheckOrderStatus(session, args) {
  console.log('→ handleCheckOrderStatus called');
  console.log('  Arguments:', args);

  const orderNumber = args?.orderNumber || args?.order_number;
  const email = args?.email;

  console.log(`  Looking up order by: ${orderNumber ? `order number "${orderNumber}"` : `email "${email}"`}`);

  if (!orderNumber && !email) {
    console.log('  ⚠️ No order number or email provided');
    return "Please provide either an order number or email address";
  }

  console.log('  Querying Shopify for order...');
  const order = await getOrderStatus(session, { orderNumber, email });

  if (!order) {
    console.log('  ⚠️ Order not found');
    return orderNumber
      ? `Order ${orderNumber} not found`
      : `No orders found for ${email}`;
  }

  console.log('  ✅ Order found:', order.name);
  console.log('  Order details:', {
    name: order.name,
    status: order.displayFulfillmentStatus,
    total: order.totalPrice
  });

  // Format order info for AI
  const orderInfo = [
    `Order ${order.name}`,
    `Status: ${order.displayFulfillmentStatus}`,
    `Total: $${order.totalPrice}`,
    order.createdAt ? `Placed on ${new Date(order.createdAt).toLocaleDateString()}` : ''
  ].filter(Boolean).join(', ');

  console.log('  ✅ Order info formatted for AI response');
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
