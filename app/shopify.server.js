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
  apiVersion: "2024-10",
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  sessionStorage: new PrismaSessionStorage(prisma),
  
  // This runs after a shop successfully installs or updates the app
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log(`Shop ${session.shop} authenticated successfully`);

      try {
        // Check if VapiConfig already exists
        const existingConfig = await prisma.vapiConfig.findUnique({
          where: { shop: session.shop }
        });

        if (!existingConfig) {
          console.log(`Creating VAPI configuration for ${session.shop}...`);

          // Generate unique signature for this shop
          const vapiSignature = randomBytes(32).toString('hex');

          // Create VAPI assistant
          const assistant = await createVapiAssistant(session.shop, vapiSignature);
          
          console.log(`Created assistant ${assistant.id} for ${session.shop}`);

          // Store in database
          await prisma.vapiConfig.create({
            data: {
              shop: session.shop,
              vapiSignature: vapiSignature,
              assistantId: assistant.id,
            }
          });

          console.log(`VapiConfig created for ${session.shop}`);
        } else {
          console.log(`VapiConfig already exists for ${session.shop}`);
        }
      } catch (error) {
        console.error(`Error setting up VAPI for ${session.shop}:`, error);
        // Don't throw - we don't want to block the OAuth flow
        // The shop can still install, they just won't have VAPI set up yet
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