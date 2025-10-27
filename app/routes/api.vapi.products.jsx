import db from "../db.server";

export async function action({ request }) {
  console.log('=== VAPI Products API Request ===');
  
  // Parse the incoming request from VAPI
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
  
  const signature = request.headers.get("X-Vapi-Signature");
  
  if (!signature) {
    return new Response(JSON.stringify({ 
      results: [{
        toolCallId,
        result: { error: "Missing authentication" }
      }]
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const vapiConfig = await db.vapiConfig.findUnique({
    where: { vapiSignature: signature }
  });

  if (!vapiConfig) {
    return new Response(JSON.stringify({ 
      results: [{
        toolCallId,
        result: { error: "Invalid authentication" }
      }]
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const shop = vapiConfig.shop;
  console.log('Authenticated shop:', shop);

  const sessionId = `offline_${shop}`;
  const session = await db.session.findUnique({
    where: { id: sessionId }
  });

  if (!session) {
    return new Response(JSON.stringify({ 
      results: [{
        toolCallId,
        result: { error: "Store not connected" }
      }]
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const shopifyResponse = await fetch(
    `https://${shop}/admin/api/2024-10/graphql.json`,
    {
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
    }
  );

  const data = await shopifyResponse.json();

  const products = data.data?.products?.edges?.map(({ node }) => ({
    title: node.title,
    description: node.description || "No description available",
    price: node.variants.edges[0]?.node.price || "Price not available",
    inventory: node.variants.edges[0]?.node.inventoryQuantity || 0
  })) || [];

  // Format as a readable string for the AI to speak
  const productList = products.map((p, i) => 
    `${i + 1}. ${p.title} - $${p.price} (${p.inventory} in stock)`
  ).join('. ');

  // Return in VAPI's expected format
  return new Response(JSON.stringify({ 
    results: [{
      toolCallId,
      result: `Here are our available products: ${productList}`
    }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}