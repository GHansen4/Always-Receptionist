import { shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";
import db from "./db.server.js";
import crypto from "crypto";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: "2024-10",
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(db),
  restResources,
  
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log('afterAuth hook triggered for shop:', session.shop);
      
      shopify.registerWebhooks({ session });
      
      const vapiSignature = crypto.randomBytes(32).toString('hex');
      
      await db.vapiConfig.upsert({
        where: { shop: session.shop },
        update: {
          updatedAt: new Date()
        },
        create: {
          shop: session.shop,
          vapiSignature: vapiSignature,
        }
      });
      
      console.log('VAPI config created/updated for shop:', session.shop);
    },
  },
});

export default shopify;
export const authenticate = shopify.authenticate;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;