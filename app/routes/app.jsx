import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("\n=== APP ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  console.log("Headers:", Object.fromEntries(request.headers.entries()));
  
  try {
    console.log("🔐 Attempting authentication...");
    await authenticate.admin(request);
    console.log("✅ Authentication successful!");
    
    const apiKey = process.env.SHOPIFY_API_KEY || "";
    console.log("API Key present:", !!apiKey);
    console.log("========================\n");
    
    return { apiKey };
  } catch (error) {
    console.error("\n❌ AUTHENTICATION FAILED");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Status:", error.status || error.statusCode || "unknown");
    console.error("Response:", error.response || "none");
    console.error("Stack:", error.stack);
    console.error("========================\n");
    
    // Re-throw the error so React Router can handle it properly
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