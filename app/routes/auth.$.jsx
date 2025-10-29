import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("\n=== AUTH CATCH-ALL ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  try {
    console.log("🔐 Attempting authentication...");
    await authenticate.admin(request);
    console.log("✅ Authentication successful!");
    console.log("========================\n");
    
    return null;
  } catch (error) {
    console.error("\n❌ AUTH ROUTE AUTHENTICATION FAILED");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Status:", error.status || error.statusCode || "unknown");
    console.error("Stack:", error.stack);
    console.error("========================\n");
    
    // Re-throw the error so React Router can handle it properly
    throw error;
  }
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
