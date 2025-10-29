import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("\n=== AUTH CATCH-ALL ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  console.log("🔐 Attempting authentication...");
  const response = await authenticate.admin(request);
  console.log("✅ Authentication response received");
  console.log("Response type:", response?.constructor?.name);
  console.log("========================\n");
  
  // If authenticate.admin returns a Response, return it
  // Otherwise return null
  return response || null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};