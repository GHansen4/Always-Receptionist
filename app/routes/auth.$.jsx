import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("\n=== AUTH CATCH-ALL ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  console.log("🔐 Attempting authentication...");
  const response = await authenticate.admin(request);
  console.log("✅ Authentication successful!");
  console.log("Response type:", response?.constructor?.name);
  console.log("========================\n");
  
  return response || null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};