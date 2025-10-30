/**
 * VAPI API helper functions
 */

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_BASE_URL = "https://api.vapi.ai";

/**
 * Create a VAPI assistant for a shop
 */
export async function createVapiAssistant(shop, vapiSignature) {
  console.log("  📞 Inside createVapiAssistant()");
  console.log("     Shop:", shop);
  console.log("     Signature:", vapiSignature.substring(0, 16) + "...");
  
  const apiKey = process.env.VAPI_PRIVATE_KEY;
  console.log("     API Key exists:", !!apiKey);
  console.log("     API Key prefix:", apiKey?.substring(0, 10) + "...");
  
  if (!apiKey) {
    throw new Error("VAPI_PRIVATE_KEY is not set in environment variables");
  }

  // Extract shop name without domain to keep name under 40 chars
  const shopName = shop.replace('.myshopify.com', '');

  const payload = {
    name: `${shopName} Receptionist`,
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
      provider: "openai",
      voiceId: "echo",
    },
    firstMessage: "Hi! Thanks for calling. How can I help you today?",
    endCallMessage: "Thanks for calling! Have a great day!",
    // Link to the tools we already created
    serverUrl: `https://always-receptionist.vercel.app/api/vapi/products`,
    serverUrlSecret: vapiSignature, // Use the shop's signature
  };
  
  console.log("     Making API request to VAPI...");
  
  try {
    const response = await fetch(`${VAPI_BASE_URL}/assistant`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("     VAPI API Response Status:", response.status);
    console.log("     VAPI API Response OK:", response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("     VAPI API Error Response:", errorText);
      throw new Error(`VAPI API error: ${response.status} - ${errorText}`);
    }

    const assistant = await response.json();
    console.log("     ✅ Assistant created:", assistant.id);
    
    return assistant;
    
  } catch (fetchError) {
    console.error("     ❌ Fetch error:", fetchError.message);
    throw fetchError;
  }
}

/**
 * Delete a VAPI assistant
 */
export async function deleteVapiAssistant(assistantId) {
  const response = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${VAPI_PRIVATE_KEY}`,
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
      "Authorization": `Bearer ${VAPI_PRIVATE_KEY}`,
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
