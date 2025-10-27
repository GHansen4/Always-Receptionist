import { createPrismaClient } from "../db.server";

export async function loader({ request }) {
  const db = createPrismaClient();
  
  try {
    // Get all sessions and show their shop values
    const allSessions = await db.session.findMany();
    
    // Also try various shop formats
    const formats = [
      "always-ai-dev-store.myshopify.com",
      "always-ai-dev-store",
      "https://always-ai-dev-store.myshopify.com",
    ];
    
    const results = {};
    for (const format of formats) {
      const session = await db.session.findFirst({
        where: { shop: format }
      });
      results[format] = session ? "FOUND" : "NOT FOUND";
    }
    
    return new Response(
      JSON.stringify({
        totalSessions: allSessions.length,
        allShopValues: allSessions.map(s => s.shop),
        formatTests: results
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await db.$disconnect();
  }
}
