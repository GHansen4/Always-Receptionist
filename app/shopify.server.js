import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp } from "@shopify/shopify-app-react-router/server";
import { LATEST_API_VERSION } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { createPrismaClient } from "./db.server";
import { createVapiAssistant } from "./utils/vapi.server";
import { randomBytes } from "crypto";

const prisma = createPrismaClient();

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  distribution: "AppDistribution.AppStore", // Change based on your distribution
  isEmbeddedApp: true,
  sessionStorage: new PrismaSessionStorage(prisma),
  
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log(`Shop ${session.shop} authenticated successfully`);

      try {
        const existingConfig = await prisma.vapiConfig.findUnique({
          where: { shop: session.shop }
        });

        if (!existingConfig) {
          console.log(`Creating VAPI configuration for ${session.shop}...`);

          const vapiSignature = randomBytes(32).toString('hex');
          const assistant = await createVapiAssistant(session.shop, vapiSignature);
          
          console.log(`Created assistant ${assistant.id} for ${session.shop}`);

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
        console.error(`Error setting up VAPI for ${session.shop}:`, {
          message: error.message,
          stack: error.stack
        });
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