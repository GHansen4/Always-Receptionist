import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("\n=== AUTH CATCH-ALL ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  console.log("🔐 Attempting authentication with retry logic...");
  
  // Retry logic for database connection timeouts
  let lastError;
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Auth attempt ${attempt}/${maxRetries}...`);
      const response = await authenticate.admin(request);
      
      console.log("✅ Authentication returned successfully!");
      console.log("Response type:", response?.constructor?.name);
      console.log("========================\n");
      
      return response || null;
      
    } catch (error) {
      console.log(`❌ Auth attempt ${attempt} failed`);
      console.log("Error type:", error.constructor.name);
      console.log("Error message:", error.message);
      
      // If it's a Response object, check the status
      if (error instanceof Response) {
        console.log("Response status:", error.status);
        console.log("Response headers:", Object.fromEntries(error.headers.entries()));
        
        // If it's a successful response (200-299) or redirect (300-399), return it
        if (error.ok || (error.status >= 300 && error.status < 400)) {
          console.log("✅ Response is OK or redirect, returning it");
          return error;
        }
        
        // If it's a 401 with retry header, it might be a database issue
        const retryHeader = error.headers.get('X-Shopify-Retry-Invalid-Session-Request');
        if (error.status === 401 && retryHeader) {
          console.log("→ 401 with retry header - likely database connection issue");
          // Continue to retry logic below
        } else {
          console.log("→ Response error is not database-related, throwing");
          throw error;
        }
      } else {
        // Check if it's a database connection error
        const isDatabaseError = 
          error.message?.includes("Can't reach database") ||
          error.message?.includes("connection pool") ||
          error.message?.includes("ETIMEDOUT") ||
          error.message?.includes("Connection timeout") ||
          error.message?.includes("Timed out fetching");
        
        console.log("Is database error?", isDatabaseError);
        
        if (!isDatabaseError) {
          console.log("→ Not a database error, throwing immediately");
          throw error;
        }
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
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};