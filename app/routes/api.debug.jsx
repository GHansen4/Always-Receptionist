import { createPrismaClient } from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  const db = createPrismaClient();
  
  try {
    // Get all sessions
    const allSessions = await db.session.findMany();
    
    // Get specific session if shop provided
    const specificSession = shop ? await db.session.findFirst({
      where: { shop }
    }) : null;
    
    return new Response(
      JSON.stringify({
        requestedShop: shop,
        totalSessions: allSessions.length,
        allSessions: allSessions.map(s => ({ 
          id: s.id, 
          shop: s.shop,
          hasAccessToken: !!s.accessToken 
        })),
        specificSession: specificSession ? {
          id: specificSession.id,
          shop: specificSession.shop,
          hasAccessToken: !!specificSession.accessToken,
          scope: specificSession.scope
        } : "NOT FOUND"
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
