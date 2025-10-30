import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  console.log("\n=== INDEX ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  try {
    console.log("🔐 Attempting authentication...");
    const { session } = await authenticate.admin(request);
    console.log("✅ Authentication successful!");
    console.log("Session ID:", session.id);
    console.log("Shop:", session.shop);
    console.log("Access Token present:", !!session.accessToken);
    
    const shop = session.shop;
    
    console.log("=== DEBUG: Index Route Loader ===");
    console.log("Shop:", shop);
  
    // Check what's in the database
    const vapiConfig = await prisma.vapiConfig.findUnique({
      where: { shop }
    });
    
    console.log("VapiConfig from DB:", JSON.stringify(vapiConfig, null, 2));
    
    if (vapiConfig) {
      console.log("Assistant ID:", vapiConfig.assistantId);
      console.log("Phone Number:", vapiConfig.phoneNumber);
      console.log("Signature exists:", !!vapiConfig.vapiSignature);
    } else {
      console.log("No VapiConfig found for this shop");
    }
    
    // Check if we can reach VAPI API
    if (vapiConfig?.assistantId) {
      try {
        const response = await fetch(`https://api.vapi.ai/assistant/${vapiConfig.assistantId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`
          }
        });
        console.log("VAPI API response status:", response.status);
        if (response.ok) {
          const assistant = await response.json();
          console.log("Assistant exists in VAPI:", assistant.name);
        } else {
          console.log("VAPI API error:", await response.text());
        }
      } catch (vapiError) {
        console.log("Error checking VAPI:", vapiError.message);
      }
    }
    
    return {
      shop,
      vapiConfig,
      isConfigured: !!vapiConfig?.assistantId,
      hasPhoneNumber: !!vapiConfig?.phoneNumber
    };
    
  } catch (error) {
    console.error("\n❌ INDEX ROUTE LOADER ERROR");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Status:", error.status || error.statusCode || "unknown");
    console.error("Stack:", error.stack);
    
    // If it's an authentication error, re-throw it so React Router can handle it
    if (error.status === 401 || error.statusCode === 401 || error.message?.includes('Unauthorized')) {
      console.error("Authentication error detected - re-throwing for React Router");
      throw error;
    }
    
    // For other errors, return error state
    return {
      shop: null,
      vapiConfig: null,
      isConfigured: false,
      hasPhoneNumber: false,
      error: error.message
    };
  }
};

export const action = async ({ request }) => {
  console.log("\n=== INDEX ROUTE ACTION ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  try {
    console.log("🔐 Attempting authentication...");
    const { admin } = await authenticate.admin(request);
    console.log("✅ Authentication successful!");
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    },
  );
  const responseJson = await response.json();
  const product = responseJson.data.productCreate.product;
  const variantId = product.variants.edges[0].node.id;
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
    const variantResponseJson = await variantResponse.json();

    return {
      product: responseJson.data.productCreate.product,
      variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
    };
  } catch (error) {
    console.error("\n❌ INDEX ROUTE ACTION ERROR");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Status:", error.status || error.statusCode || "unknown");
    console.error("Stack:", error.stack);
    
    // Re-throw authentication errors
    if (error.status === 401 || error.statusCode === 401 || error.message?.includes('Unauthorized')) {
      console.error("Authentication error detected - re-throwing for React Router");
      throw error;
    }
    
    // For other errors, throw them as well so React Router can handle them
    throw error;
  }
};

export default function Index() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  console.log("=== DEBUG: Component Data ===", data);

  useEffect(() => {
    if (fetcher.data?.product?.id) {
      shopify.toast.show("Product created");
    }
  }, [fetcher.data?.product?.id, shopify]);
  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="AI Receptionist Dashboard">
      <s-button slot="primary-action" variant="primary" onClick={generateProduct}>
        Generate a product
      </s-button>

      {/* Show debug info in dev mode */}
      {process.env.NODE_ENV === 'development' && (
        <s-banner tone="info">
          <p><strong>Debug Info:</strong></p>
          <p>Shop: {data.shop}</p>
          <p>Is Configured: {data.isConfigured ? 'Yes' : 'No'}</p>
          <p>Has Phone Number: {data.hasPhoneNumber ? 'Yes' : 'No'}</p>
          <p>Assistant ID: {data.vapiConfig?.assistantId || 'None'}</p>
          <p>Phone Number: {data.vapiConfig?.phoneNumber || 'None'}</p>
        </s-banner>
      )}
      
      {!data.isConfigured && (
        <s-banner tone="warning">
          Your AI assistant is not configured yet. Please complete setup first.
        </s-banner>
      )}

      <s-section heading="Congrats on creating a new Shopify app 🎉">
        <s-paragraph>
          This embedded app template uses{" "}
          <s-link
            href="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
          >
            App Bridge
          </s-link>{" "}
          interface examples like an{" "}
          <s-link href="/app/additional">additional page in the app nav</s-link>
          , as well as an{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            Admin GraphQL
          </s-link>{" "}
          mutation demo, to provide a starting point for app development.
        </s-paragraph>
      </s-section>
      <s-section heading="Get started with products">
        <s-paragraph>
          Generate a product with GraphQL and get the JSON output for that
          product. Learn more about the{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate"
            target="_blank"
          >
            productCreate
          </s-link>{" "}
          mutation in our API references.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={generateProduct}
            {...(isLoading ? { loading: true } : {})}
          >
            Generate a product
          </s-button>
          {fetcher.data?.product && (
            <s-button
              onClick={() => {
                shopify.intents.invoke?.("edit:shopify/Product", {
                  value: fetcher.data?.product?.id,
                });
              }}
              target="_blank"
              variant="tertiary"
            >
              Edit product
            </s-button>
          )}
        </s-stack>
        {fetcher.data?.product && (
          <s-section heading="productCreate mutation">
            <s-stack direction="block" gap="base">
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.product, null, 2)}</code>
                </pre>
              </s-box>

              <s-heading>productVariantsBulkUpdate mutation</s-heading>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <pre style={{ margin: 0 }}>
                  <code>{JSON.stringify(fetcher.data.variant, null, 2)}</code>
                </pre>
              </s-box>
            </s-stack>
          </s-section>
        )}
      </s-section>

      <s-section slot="aside" heading="App template specs">
        <s-paragraph>
          <s-text>Framework: </s-text>
          <s-link href="https://reactrouter.com/" target="_blank">
            React Router
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Interface: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/app-home/using-polaris-components"
            target="_blank"
          >
            Polaris web components
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>API: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            GraphQL
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Database: </s-text>
          <s-link href="https://www.prisma.io/" target="_blank">
            Prisma
          </s-link>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next steps">
        <s-unordered-list>
          <s-list-item>
            Build an{" "}
            <s-link
              href="https://shopify.dev/docs/apps/getting-started/build-app-example"
              target="_blank"
            >
              example app
            </s-link>
          </s-list-item>
          <s-list-item>
            Explore Shopify&apos;s API with{" "}
            <s-link
              href="https://shopify.dev/docs/apps/tools/graphiql-admin-api"
              target="_blank"
            >
              GraphiQL
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
