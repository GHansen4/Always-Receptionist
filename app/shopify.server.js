import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

import { createVapiAssistant } from "./utils/vapi.server";
import { randomBytes } from "crypto";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: "2024-10",
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  isEmbeddedApp: true,
  sessionStorage: new PrismaSessionStorage(prisma), // ✅ FIXED: Removed invalid second parameter
  
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log("\n" + "=".repeat(60));
      console.log("🚀 AFTERAUTH HOOK STARTED");
      console.log("=".repeat(60));
      console.log("Shop:", session.shop);
      console.log("Session ID:", session.id);
      console.log("Access Token exists:", !!session.accessToken);
      console.log("Environment check:");
      console.log("  - VAPI_PRIVATE_KEY exists:", !!process.env.VAPI_PRIVATE_KEY);
      console.log("  - DATABASE_URL exists:", !!process.env.DATABASE_URL);
      console.log("=".repeat(60) + "\n");

      try {
        // Check if VapiConfig already exists
        console.log("📊 Checking database for existing config...");
        const existingConfig = await prisma.vapiConfig.findUnique({
          where: { shop: session.shop }
        });

        if (existingConfig) {
          console.log("✅ VapiConfig already exists for", session.shop);
          console.log("   Assistant ID:", existingConfig.assistantId);
          console.log("   Phone Number:", existingConfig.phoneNumber || "None");
          console.log("=".repeat(60) + "\n");
          return;
        }

        console.log("📝 No existing config found. Creating new one...\n");

        // Generate unique signature
        console.log("🔐 Step 1: Generating signature...");
        const vapiSignature = randomBytes(32).toString('hex');
        console.log("✅ Signature generated:", vapiSignature.substring(0, 16) + "...");

        // Create VAPI assistant
        console.log("\n📞 Step 2: Creating VAPI assistant...");
        console.log("   Calling createVapiAssistant()...");
        
        const assistant = await createVapiAssistant(session.shop, vapiSignature);
        
        console.log("✅ VAPI assistant created successfully!");
        console.log("   Assistant ID:", assistant.id);
        console.log("   Assistant Name:", assistant.name);

        // Store in database
        console.log("\n💾 Step 3: Saving to database...");
        const savedConfig = await prisma.vapiConfig.create({
          data: {
            shop: session.shop,
            vapiSignature: vapiSignature,
            assistantId: assistant.id,
          }
        });

        console.log("✅ VapiConfig saved to database!");
        console.log("   ID:", savedConfig.id);
        console.log("   Shop:", savedConfig.shop);
        console.log("   Assistant ID:", savedConfig.assistantId);

        console.log("\n" + "=".repeat(60));
        console.log("✅ AFTERAUTH HOOK COMPLETED SUCCESSFULLY");
        console.log("=".repeat(60) + "\n");

      } catch (error) {
        console.error("\n" + "=".repeat(60));
        console.error("❌ ERROR IN AFTERAUTH HOOK");
        console.error("=".repeat(60));
        console.error("Error Type:", error.constructor.name);
        console.error("Error Message:", error.message);
        console.error("\nFull Error Object:");
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        console.error("\nStack Trace:");
        console.error(error.stack);
        console.error("=".repeat(60) + "\n");
      }
    },
  },
});

export default shopify;
export const authenticate = shopify.authenticate;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;