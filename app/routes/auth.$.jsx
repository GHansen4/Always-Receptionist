import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("\n=== AUTH CATCH-ALL ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  console.log("🔐 Attempting authentication with retry logic...");
  
  try {
    // Retry logic for database connection timeouts
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Auth attempt ${attempt}/${maxRetries}...`);
        const response = await authenticate.admin(request);
        console.log("✅ Authentication successful!");
        console.log("Response type:", response?.constructor?.name);
        console.log("========================\n");
        
        return response || null;
        
      } catch (error) {
        // Check if it's a database connection error
        const isDatabaseError = 
          error.message?.includes("Can't reach database") ||
          error.message?.includes("connection pool") ||
          error.message?.includes("ETIMEDOUT") ||
          error.message?.includes("Connection timeout") ||
          error.message?.includes("Timed out fetching");
        
        console.log(`❌ Auth attempt ${attempt} failed`);
        console.log("Error type:", error.constructor.name);
        console.log("Error message:", error.message);
        console.log("Is database error?", isDatabaseError);
        
        // If it's a Response (redirect), throw immediately - don't retry
        if (error instanceof Response) {
          console.log("→ This is a Response redirect, throwing immediately");
          throw error;
        }
        
        // If it's not a database error, throw immediately
        if (!isDatabaseError) {
          console.log("→ Not a database error, throwing immediately");
          throw error;
        }
        
        // Store the error and retry if we have attempts left
        lastError = error;
        
        if (attempt < maxRetries) {
          const waitTime = 2000 * attempt; // 2s, 4s, 6s
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // If we exhausted all retries, throw the last error
    console.log("❌ All auth retry attempts exhausted");
    throw lastError;
    
  } catch (error) {
    console.log("🚨 Fatal error in auth route:");
    console.log("Error:", error);
    console.log("Stack:", error.stack);
    throw error;
  }
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};