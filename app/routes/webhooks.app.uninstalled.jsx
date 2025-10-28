import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      await prisma.session.deleteMany({ where: { shop } });
    }

    return new Response();
  } catch (error) {
    console.error(`Error processing webhook:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
};