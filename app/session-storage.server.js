// /app/session-storage.server.js
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

/**
 * Lazy session storage that creates the Prisma client on first use
 * This avoids the cold-start timing issue in serverless environments
 */
class LazyPrismaSessionStorage {
  constructor() {
    this._storage = null;
    this._client = null;
  }

  _getStorage() {
    if (!this._storage) {
      console.log('Initializing session storage with Prisma client...');
      this._client = prisma;
      this._storage = new PrismaSessionStorage(this._client);
    }
    return this._storage;
  }

  async storeSession(session) {
    return this._getStorage().storeSession(session);
  }

  async loadSession(id) {
    return this._getStorage().loadSession(id);
  }

  async deleteSession(id) {
    return this._getStorage().deleteSession(id);
  }

  async deleteSessions(ids) {
    return this._getStorage().deleteSessions(ids);
  }

  async findSessionsByShop(shop) {
    return this._getStorage().findSessionsByShop(shop);
  }
}

export const sessionStorage = new LazyPrismaSessionStorage();
