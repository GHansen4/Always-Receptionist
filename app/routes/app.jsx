import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("\n=== APP ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  console.log("🔐 Attempting authentication...");
  
  try {
    // Retry logic specifically for database connection timeouts
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries}...`);
        const result = await authenticate.admin(request);
        console.log("✅ Authentication successful!");
        
        const apiKey = process.env.SHOPIFY_API_KEY || "";
        console.log("========================\n");
        
        return { apiKey };
        
      } catch (error) {
        // Check if it's a database connection error
        const isDatabaseError = 
          error.message?.includes("Can't reach database") ||
          error.message?.includes("connection pool") ||
          error.message?.includes("ETIMEDOUT") ||
          error.message?.includes("Connection timeout");
        
        console.log(`❌ Attempt ${attempt} failed`);
        console.log("Error type:", error.constructor.name);
        console.log("Error message:", error.message);
        console.log("Is database error?", isDatabaseError);
        
        // If it's a Response (redirect/auth flow), throw immediately
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
          const waitTime = 1000 * attempt;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // If we exhausted all retries, throw the last error
    console.log("❌ All retry attempts exhausted");
    throw lastError;
    
  } catch (error) {
    console.log("🚨 Fatal error in loader:");
    console.log(error);
    throw error;
  }
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};