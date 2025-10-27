import { json } from "@remix-run/node";
import db from "../db.server";

export async function action({ request }) {
  console.log('=== VAPI Products API Request ===');
  
  // STEP 1: Authenticate VAPI Request & Get Shop
  const signature = request.headers.get("X-Vapi-Signature");
  
  if (!signature) {
    return json({ error: "Missing X-Vapi-Signature header" }, { status: 401 });
  }

  // Look up which shop owns this signature
  const vapiConfig = await db.vapiConfig.findUnique({
    where: { vapiSignature: signature }
  });

  if (!vapiConfig) {
    return json({ error: "Invalid VAPI signature" }, { status: 401 });
  }

  const shop = vapiConfig.shop;
  console.log('Authenticated shop from VAPI signature:', shop);

  // STEP 2: Get Shopify Session & Admin Context
  // This uses Shopify's session storage to get the stored OAuth token
  const sessionId = `offline_${shop}`;
  const session = await db.session.findUnique({
    where: { id: sessionId }
  });

  if (!session) {
    return json({ error: "Shop not authenticated with Shopify" }, { status: 401 });
  }

  // STEP 3: Make Authenticated GraphQL Request to Shopify
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

  // STEP 4: Format Response for VAPI
  const products = data.data?.products?.edges?.map(({ node }) => ({
    id: node.id,
    title: node.title,
    description: node.description,
    price: node.variants.edges[0]?.node.price,
    inventory: node.variants.edges[0]?.node.inventoryQuantity
  })) || [];

  return json({ 
    success: true, 
    products,
    shop 
  });
}