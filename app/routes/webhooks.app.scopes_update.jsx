import { authenticate } from "../shopify.server";
import { createPrismaClient } from "../db.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  const db = createPrismaClient();

  try {
    if (session) {
      await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          scope: current.toString(),
        },
      });
    }

    return new Response();
  } finally {
    await db.$disconnect();
  }
};
