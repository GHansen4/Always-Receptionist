import db from "../db.server";

export async function action({ request }) {
  console.log('=== VAPI Products API Request ===');
  
  const signature = request.headers.get("X-Vapi-Signature");
  
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing X-Vapi-Signature header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const vapiConfig = await db.vapiConfig.findUnique({
    where: { vapiSignature: signature }
  });

  if (!vapiConfig) {
    return new Response(JSON.stringify({ error: "Invalid VAPI signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const shop = vapiConfig.shop;
  console.log('Authenticated shop from VAPI signature:', shop);

  const sessionId = `offline_${shop}`;
  const session = await db.session.findUnique({
    where: { id: sessionId }
  });

  if (!session) {
    return new Response(JSON.stringify({ error: "Shop not authenticated with Shopify" }), {
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
    id: node.id,
    title: node.title,
    description: node.description,
    price: node.variants.edges[0]?.node.price,
    inventory: node.variants.edges[0]?.node.inventoryQuantity
  })) || [];

  return new Response(JSON.stringify({ 
    success: true, 
    products,
    shop 
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}