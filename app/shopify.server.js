import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { createPrismaClient } from "./db.server";
import { createVapiAssistant } from "./utils/vapi.server";
import { randomBytes } from "crypto";

const prisma = createPrismaClient();

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: "2024-10", // Use the current stable API version
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  distribution: "AppDistribution.AppStore", // Change based on your distribution
  isEmbeddedApp: true,
  sessionStorage: new PrismaSessionStorage(prisma),
  
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log("===========================================");
      console.log("🚀 AFTERAUTH HOOK STARTED");
      console.log("Shop:", session.shop);
      console.log("Session ID:", session.id);
      console.log("===========================================");

      try {
        // Check if VapiConfig already exists
        const existingConfig = await prisma.vapiConfig.findUnique({
          where: { shop: session.shop }
        });

        console.log("Existing config:", existingConfig);

        if (!existingConfig) {
          console.log("📝 Creating new VAPI configuration...");

          // Generate unique signature
          const vapiSignature = randomBytes(32).toString('hex');
          console.log("✅ Generated signature:", vapiSignature.substring(0, 10) + "...");

          // Create VAPI assistant
          console.log("📞 Calling VAPI API to create assistant...");
          const assistant = await createVapiAssistant(session.shop, vapiSignature);
          console.log("✅ Assistant created:", assistant.id);

          // Store in database
          console.log("💾 Saving to database...");
          const savedConfig = await prisma.vapiConfig.create({
            data: {
              shop: session.shop,
              vapiSignature: vapiSignature,
              assistantId: assistant.id,
            }
          });
          console.log("✅ VapiConfig saved:", savedConfig);

        } else {
          console.log("ℹ️ VapiConfig already exists, skipping creation");
        }

        console.log("===========================================");
        console.log("✅ AFTERAUTH HOOK COMPLETED SUCCESSFULLY");
        console.log("===========================================");

      } catch (error) {
        console.error("===========================================");
        console.error("❌ ERROR IN AFTERAUTH HOOK");
        console.error("Error type:", error.constructor.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        console.error("===========================================");
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