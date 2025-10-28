/**
 * VAPI API helper functions
 */

const VAPI_API_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_BASE_URL = "https://api.vapi.ai";

/**
 * Create a VAPI assistant for a shop
 */
export async function createVapiAssistant(shop, vapiSignature) {
  const response = await fetch(`${VAPI_BASE_URL}/assistant`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `${shop} - AI Receptionist`,
      model: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.7,
        systemPrompt: `You are a friendly AI receptionist for an online store. 

Your role:
- Answer questions about products and inventory
- Help customers find what they're looking for
- Be helpful, professional, and concise

Important rules:
- Never make up product information - always use the get_products tool
- Keep responses brief and conversational (this is a phone call)
- If you don't know something, be honest and offer to transfer to a human

The store you're representing is: ${shop}`,
      },
      voice: {
        provider: "elevenlabs",
        voiceId: "rachel",
      },
      firstMessage: "Hi! Thanks for calling. How can I help you today?",
      endCallMessage: "Thanks for calling! Have a great day!",
      // Link to the tools we already created
      serverUrl: `https://always-receptionist.vercel.app/api/vapi/products`,
      serverUrlSecret: vapiSignature, // Use the shop's signature
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create assistant: ${error.message || response.statusText}`);
  }

  return await response.json();
}

/**
 * Delete a VAPI assistant
 */
export async function deleteVapiAssistant(assistantId) {
  const response = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${VAPI_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete assistant: ${response.statusText}`);
  }

  return true;
}

/**
 * Update a VAPI assistant
 */
export async function updateVapiAssistant(assistantId, updates) {
  const response = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to update assistant: ${error.message || response.statusText}`);
  }

  return await response.json();
}
