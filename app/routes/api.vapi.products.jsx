import prisma from "../db.server";

export async function action({ request }) {
  console.log('=== VAPI Products API Request ===');
  
  try {
    // Parse the incoming request from VAPI
    console.log('Step 1: Parsing request body...');
    const body = await request.json();
    console.log('VAPI Request Body:', body);
    
    console.log('=== TOOL CALLS DETAIL ===');
    console.log('Tool Calls:', JSON.stringify(body.message?.toolCalls, null, 2));
    console.log('Tool Call List:', JSON.stringify(body.message?.toolCallList, null, 2));
    console.log('Tool With Tool Call List:', JSON.stringify(body.message?.toolWithToolCallList, null, 2));
    
    // Extract toolCallId from VAPI's request
    const toolCallId = body?.message?.toolCallList?.[0]?.id || body?.toolCallId;
    
    console.log('Extracted toolCallId:', body?.message?.toolCallList?.[0]?.id);
    console.log('Extracted function name:', body?.message?.toolCallList?.[0]?.function?.name);
    console.log('Extracted arguments:', body?.message?.toolCallList?.[0]?.function?.arguments);
    
    // Step 2: Check authentication
    console.log('Step 2: Checking authentication...');
    const signature = request.headers.get("X-Vapi-Signature");
    console.log('Signature header:', signature ? 'Present' : 'Missing');
    
    if (!signature) {
      console.log('ERROR: Missing X-Vapi-Signature header');
      return Response.json({ 
        results: [{
          toolCallId,
          result: "Missing authentication header"
        }]
      }, { status: 401 });
    }

    // Step 3: Look up shop by signature
    console.log('Step 3: Looking up shop by signature...');
    console.log('Looking for signature:', signature);
    
    const vapiConfig = await prisma.vapiConfig.findUnique({
      where: { vapiSignature: signature }
    });
    
    console.log('VapiConfig found:', !!vapiConfig);
    if (vapiConfig) {
      console.log('VapiConfig shop:', vapiConfig.shop);
    }

    if (!vapiConfig) {
      console.log('ERROR: VapiConfig not found for signature');
      return Response.json({ 
        results: [{
          toolCallId,
          result: "Invalid authentication signature"
        }]
      }, { status: 401 });
    }

    const shop = vapiConfig.shop;
    console.log('Step 4: Authenticated shop:', shop);

    // Step 5: Get Shopify session
    console.log('Step 5: Getting Shopify session...');
    const sessionId = `offline_${shop}`;
    console.log('Looking for session ID:', sessionId);
    
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    });
    
    console.log('Session found:', !!session);
    if (session) {
      console.log('Session has access token:', !!session.accessToken);
    }

    if (!session) {
      console.log('ERROR: Shopify session not found');
      return Response.json({ 
        results: [{
          toolCallId,
          result: "Store not connected to Shopify"
        }]
      }, { status: 401 });
    }

    // Step 6: Fetch products from Shopify
    console.log('Step 6: Fetching products from Shopify...');
    const shopifyUrl = `https://${shop}/admin/api/2024-10/graphql.json`;
    console.log('Shopify URL:', shopifyUrl);
    
    const shopifyResponse = await fetch(shopifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query: `
          query getProducts {
            products(first: 10) {
              edges {
                node {
                  id
                  title
                  description
                  variants(first: 5) {
                    edges {
                      node {
                        price
                        inventoryQuantity
                      }
                    }
                  }
                }
              }
            }
          }
        `
      })
    });
    
    console.log('Shopify response status:', shopifyResponse.status);
    console.log('Shopify response ok:', shopifyResponse.ok);

    if (!shopifyResponse.ok) {
      console.log('ERROR: Shopify API request failed');
      const errorText = await shopifyResponse.text();
      console.log('Shopify error response:', errorText);
      return Response.json({ 
        results: [{
          toolCallId,
          result: "Failed to fetch products from Shopify"
        }]
      }, { status: 500 });
    }

    // Step 7: Parse Shopify response
    console.log('Step 7: Parsing Shopify response...');
    const data = await shopifyResponse.json();
    console.log('Shopify response data:', JSON.stringify(data, null, 2));

    // Step 8: Format products
    console.log('Step 8: Formatting products...');
    const products = data.data?.products?.edges?.map(({ node }) => ({
      title: node.title,
      description: node.description || "No description available",
      price: node.variants.edges[0]?.node.price || "Price not available",
      inventory: node.variants.edges[0]?.node.inventoryQuantity || 0
    })) || [];

    console.log('Products found:', products.length);
    console.log('Products:', JSON.stringify(products, null, 2));

    // Step 9: Format response for AI
    console.log('Step 9: Formatting response for AI...');
    const productList = products.map((p, i) => 
      `${i + 1}. ${p.title} - $${p.price} (${p.inventory} in stock)`
    ).join('. ');

    const resultText = products.length > 0 
      ? `Here are our available products: ${productList}`
      : "No products found in the store";

    console.log('Final result text:', resultText);

    // Step 10: Send response
    console.log('Step 10: Sending response...');
    const response = Response.json({ 
      results: [{
        toolCallId,
        result: resultText
      }]
    });
    
    console.log('Response created successfully');
    console.log('=== VAPI Products API Request COMPLETED ===');
    
    return response;

  } catch (error) {
    console.error('=== VAPI Products API ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', error);
    
    // Extract toolCallId for error response
    let toolCallId = 'unknown';
    try {
      const body = await request.json();
      toolCallId = body?.message?.toolCallList?.[0]?.id || body?.toolCallId || 'unknown';
    } catch (parseError) {
      console.error('Failed to parse request for error response:', parseError);
    }
    
    return Response.json({ 
      results: [{
        toolCallId,
        result: `Error: ${error.message}`
      }]
    }, { status: 500 });
  }
}