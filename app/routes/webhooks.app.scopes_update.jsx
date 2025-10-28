import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Handle scopes update if needed
    // For now, just log it

    return new Response();
  } catch (error) {
    console.error(`Error processing webhook:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
};