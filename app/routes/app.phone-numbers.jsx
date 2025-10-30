import { useState } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Loader: Get current phone number status
export async function loader({ request }) {
  console.log("\n=== PHONE NUMBERS ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);

  try {
    console.log("🔐 Attempting authentication...");
    const { session } = await authenticate.admin(request);
    console.log("✅ Authentication successful!");
    console.log("Session ID:", session.id);
    console.log("Shop:", session.shop);

    const vapiConfig = await prisma.vapiConfig.findUnique({
      where: { shop: session.shop },
      select: {
        phoneNumber: true,
        phoneNumberId: true,
        assistantId: true,
        vapiSignature: true,
      }
    });

    let assistant = null;

    // Fetch assistant details from VAPI if we have an assistantId
    if (vapiConfig?.assistantId) {
      try {
        const response = await fetch(`https://api.vapi.ai/assistant/${vapiConfig.assistantId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`
          }
        });

        if (response.ok) {
          assistant = await response.json();
          console.log("✅ Fetched assistant:", assistant.name);
        } else {
          console.log("⚠️ Could not fetch assistant:", response.status);
        }
      } catch (vapiError) {
        console.log("⚠️ Error fetching assistant:", vapiError.message);
      }
    }

    return {
      phoneNumber: vapiConfig?.phoneNumber || null,
      hasAssistant: !!vapiConfig?.assistantId,
      assistant,
      shop: session.shop,
      vapiConfig,
    };
  } catch (error) {
    console.error("\n❌ PHONE NUMBERS LOADER ERROR");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Status:", error.status || error.statusCode || "unknown");
    console.error("Stack:", error.stack);

    // Re-throw authentication errors
    if (error.status === 401 || error.statusCode === 401 || error.message?.includes('Unauthorized')) {
      console.error("Authentication error detected - re-throwing for React Router");
      throw error;
    }

    return { error: error.message };
  }
}

// Action: Provision or release phone number, or create assistant
export async function action({ request }) {
  console.log("\n=== PHONE NUMBERS ROUTE ACTION ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);

  try {
    console.log("🔐 Attempting authentication...");
    const { session } = await authenticate.admin(request);
    console.log("✅ Authentication successful!");
    console.log("Session ID:", session.id);
    console.log("Shop:", session.shop);

    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "create_assistant") {
      console.log("Creating new VAPI assistant...");

      // Get or create vapiConfig with signature
      let vapiConfig = await prisma.vapiConfig.findUnique({
        where: { shop: session.shop }
      });

      if (!vapiConfig) {
        // Create new config with signature
        const crypto = await import('crypto');
        const vapiSignature = crypto.randomBytes(32).toString('hex');
        vapiConfig = await prisma.vapiConfig.create({
          data: {
            shop: session.shop,
            vapiSignature,
          }
        });
      }

      // Build assistant payload from form data
      const shopName = session.shop.replace('.myshopify.com', '');
      const assistantName = formData.get("assistantName") || `${shopName} Receptionist`;
      const voiceProvider = formData.get("voiceProvider") || "openai";
      const voiceId = formData.get("voiceId") || "echo";
      const model = formData.get("model") || "gpt-4o";
      const temperature = parseFloat(formData.get("temperature") || "0.7");
      const systemPrompt = formData.get("systemPrompt") || `You are a friendly AI receptionist for an online store.

Your role:
- Answer questions about products and inventory
- Help customers find what they're looking for
- Be helpful, professional, and concise

Important rules:
- Never make up product information - always use the get_products tool
- Keep responses brief and conversational (this is a phone call)
- If you don't know something, be honest and offer to transfer to a human

The store you're representing is: ${session.shop}`;
      const firstMessage = formData.get("firstMessage") || "Hi! Thanks for calling. How can I help you today?";
      const endCallMessage = formData.get("endCallMessage") || "Thanks for calling! Have a great day!";

      // Fetch existing tools from VAPI to find get_products tool
      let toolIds = [];
      try {
        const toolsResponse = await fetch("https://api.vapi.ai/tool", {
          headers: {
            "Authorization": `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
          }
        });

        if (toolsResponse.ok) {
          const tools = await toolsResponse.json();
          // Find the get_products tool
          const getProductsTool = tools.find(tool =>
            tool.function?.name === "get_products" ||
            tool.name === "get_products"
          );

          if (getProductsTool) {
            toolIds = [getProductsTool.id];
            console.log("✅ Found existing get_products tool:", getProductsTool.id);
          } else {
            console.log("⚠️ No get_products tool found in VAPI");
          }
        }
      } catch (toolError) {
        console.log("⚠️ Error fetching tools:", toolError.message);
      }

      const payload = {
        name: assistantName,
        model: {
          provider: "openai",
          model: model,
          temperature: temperature,
          systemPrompt: systemPrompt,
        },
        voice: {
          provider: voiceProvider,
          voiceId: voiceId,
        },
        firstMessage: firstMessage,
        endCallMessage: endCallMessage,
        serverUrl: `https://always-receptionist.vercel.app/api/vapi/products`,
        serverUrlSecret: vapiConfig.vapiSignature,
      };

      // Add toolIds if we found the get_products tool
      if (toolIds.length > 0) {
        payload.toolIds = toolIds;
      }


      const response = await fetch("https://api.vapi.ai/assistant", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("VAPI API error:", errorText);
        return {
          success: false,
          error: `Failed to create assistant: ${errorText}`
        };
      }

      const assistant = await response.json();
      console.log("✅ Assistant created:", assistant.id);

      // Save assistant ID to database
      await prisma.vapiConfig.update({
        where: { shop: session.shop },
        data: {
          assistantId: assistant.id,
        }
      });

      return {
        success: true,
        message: "Assistant created successfully!",
        assistantId: assistant.id,
      };
    }

    if (action === "provision") {
      // Call VAPI API to buy a phone number
      const vapiResponse = await fetch("https://api.vapi.ai/phone-number", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "twilio",
        })
      });

      if (!vapiResponse.ok) {
        const error = await vapiResponse.json();
        return {
          success: false,
          error: error.message || "Failed to provision number"
        };
      }

      const phoneNumberData = await vapiResponse.json();

      // Update database with phone number
      await prisma.vapiConfig.update({
        where: { shop: session.shop },
        data: {
          phoneNumber: phoneNumberData.number,
          phoneNumberId: phoneNumberData.id,
        }
      });

      return {
        success: true,
        phoneNumber: phoneNumberData.number
      };
    }

    if (action === "release") {
      const vapiConfig = await prisma.vapiConfig.findUnique({
        where: { shop: session.shop }
      });

      if (vapiConfig?.phoneNumberId) {
        // Call VAPI API to release the number
        await fetch(`https://api.vapi.ai/phone-number/${vapiConfig.phoneNumberId}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
          }
        });

        // Update database
        await prisma.vapiConfig.update({
          where: { shop: session.shop },
          data: {
            phoneNumber: null,
            phoneNumberId: null,
          }
        });
      }

      return { success: true };
    }

    if (action === "delete_assistant") {
      const vapiConfig = await prisma.vapiConfig.findUnique({
        where: { shop: session.shop }
      });

      if (vapiConfig?.assistantId) {
        // Call VAPI API to delete the assistant
        try {
          await fetch(`https://api.vapi.ai/assistant/${vapiConfig.assistantId}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
            }
          });
          console.log("✅ Assistant deleted from VAPI");
        } catch (deleteError) {
          console.log("⚠️ Error deleting from VAPI:", deleteError.message);
        }

        // Update database
        await prisma.vapiConfig.update({
          where: { shop: session.shop },
          data: {
            assistantId: null,
          }
        });
      }

      return {
        success: true,
        message: "Assistant deleted. You can now create a new one."
      };
    }

    return { success: false, error: "Invalid action" };

  } catch (error) {
    console.error("\n❌ PHONE NUMBERS ACTION ERROR");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Status:", error.status || error.statusCode || "unknown");
    console.error("Stack:", error.stack);

    // Re-throw authentication errors
    if (error.status === 401 || error.statusCode === 401 || error.message?.includes('Unauthorized')) {
      console.error("Authentication error detected - re-throwing for React Router");
      throw error;
    }

    return {
      success: false,
      error: error.message
    };
  }
}

// Component using Polaris web components
export default function PhoneNumbers() {
  const { phoneNumber, hasAssistant, assistant, shop } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [showAssistantForm, setShowAssistantForm] = useState(false);

  const handleProvision = () => {
    const formData = new FormData();
    formData.append("action", "provision");
    submit(formData, { method: "post" });
  };

  const handleRelease = () => {
    if (confirm("Are you sure you want to release this phone number? This cannot be undone.")) {
      const formData = new FormData();
      formData.append("action", "release");
      submit(formData, { method: "post" });
    }
  };

  const handleDeleteAssistant = () => {
    if (confirm("Are you sure you want to delete this assistant? This will allow you to create a new one with different settings.")) {
      const formData = new FormData();
      formData.append("action", "delete_assistant");
      submit(formData, { method: "post" });
    }
  };

  const handleCreateAssistant = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.append("action", "create_assistant");
    submit(formData, { method: "post" });
  };

  const shopName = shop?.replace('.myshopify.com', '') || '';

  return (
    <s-page heading="Phone Numbers">
      <s-block-stack gap="500">
        {actionData?.success && (
          <s-banner tone="success">
            <p>{actionData.message || "Operation completed successfully!"}</p>
          </s-banner>
        )}

        {actionData?.error && (
          <s-banner tone="critical">
            <p>Error: {actionData.error}</p>
          </s-banner>
        )}

        {!hasAssistant ? (
          <s-card>
            <s-block-stack gap="400">
              <s-block-stack gap="200">
                <s-text variant="headingMd" as="h2">
                  Create AI Assistant
                </s-text>
                <s-text tone="subdued">
                  Configure your VAPI assistant to handle customer calls
                </s-text>
              </s-block-stack>

              <s-divider />

              {!showAssistantForm ? (
                <s-block-stack gap="300">
                  <s-text as="p">
                    You need to create an AI assistant before you can provision a phone number.
                    The assistant will answer calls and help your customers.
                  </s-text>
                  <s-button
                    variant="primary"
                    size="large"
                    onClick={() => setShowAssistantForm(true)}
                  >
                    Create Assistant
                  </s-button>
                </s-block-stack>
              ) : (
                <form onSubmit={handleCreateAssistant}>
                  <s-block-stack gap="400">
                    <s-block-stack gap="200">
                      <label htmlFor="assistantName">
                        <s-text variant="bodyMd" as="span">Assistant Name</s-text>
                      </label>
                      <input
                        id="assistantName"
                        name="assistantName"
                        type="text"
                        defaultValue={`${shopName} Receptionist`}
                        placeholder="My Store Receptionist"
                        maxLength="40"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #c4cdd5',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      />
                      <s-text variant="bodySm" tone="subdued">Maximum 40 characters</s-text>
                    </s-block-stack>

                    <s-block-stack gap="200">
                      <label htmlFor="voiceProvider">
                        <s-text variant="bodyMd" as="span">Voice Provider</s-text>
                      </label>
                      <select
                        id="voiceProvider"
                        name="voiceProvider"
                        defaultValue="openai"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #c4cdd5',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="openai">OpenAI</option>
                        <option value="11labs">ElevenLabs</option>
                        <option value="playht">PlayHT</option>
                      </select>
                    </s-block-stack>

                    <s-block-stack gap="200">
                      <label htmlFor="voiceId">
                        <s-text variant="bodyMd" as="span">Voice ID</s-text>
                      </label>
                      <input
                        id="voiceId"
                        name="voiceId"
                        type="text"
                        defaultValue="echo"
                        placeholder="echo, ash, alloy, etc."
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #c4cdd5',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      />
                      <s-text variant="bodySm" tone="subdued">
                        For OpenAI: alloy, echo, fable, onyx, nova, shimmer
                      </s-text>
                    </s-block-stack>

                    <s-block-stack gap="200">
                      <label htmlFor="model">
                        <s-text variant="bodyMd" as="span">AI Model</s-text>
                      </label>
                      <select
                        id="model"
                        name="model"
                        defaultValue="gpt-4o"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #c4cdd5',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      >
                        <option value="gpt-4o">GPT-4o (Recommended)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini (Faster, cheaper)</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Cheapest)</option>
                      </select>
                    </s-block-stack>

                    <s-block-stack gap="200">
                      <label htmlFor="temperature">
                        <s-text variant="bodyMd" as="span">Temperature (Creativity)</s-text>
                      </label>
                      <input
                        id="temperature"
                        name="temperature"
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        defaultValue="0.7"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #c4cdd5',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      />
                      <s-text variant="bodySm" tone="subdued">
                        0 = More focused, 1 = More creative
                      </s-text>
                    </s-block-stack>

                    <s-block-stack gap="200">
                      <label htmlFor="firstMessage">
                        <s-text variant="bodyMd" as="span">First Message</s-text>
                      </label>
                      <input
                        id="firstMessage"
                        name="firstMessage"
                        type="text"
                        defaultValue="Hi! Thanks for calling. How can I help you today?"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #c4cdd5',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      />
                      <s-text variant="bodySm" tone="subdued">
                        What the assistant says when answering the call
                      </s-text>
                    </s-block-stack>

                    <s-block-stack gap="200">
                      <label htmlFor="endCallMessage">
                        <s-text variant="bodyMd" as="span">End Call Message</s-text>
                      </label>
                      <input
                        id="endCallMessage"
                        name="endCallMessage"
                        type="text"
                        defaultValue="Thanks for calling! Have a great day!"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #c4cdd5',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      />
                      <s-text variant="bodySm" tone="subdued">
                        What the assistant says before hanging up
                      </s-text>
                    </s-block-stack>

                    <s-block-stack gap="200">
                      <label htmlFor="systemPrompt">
                        <s-text variant="bodyMd" as="span">System Prompt (Instructions)</s-text>
                      </label>
                      <textarea
                        id="systemPrompt"
                        name="systemPrompt"
                        rows="8"
                        defaultValue={`You are a friendly AI receptionist for an online store.

Your role:
- Answer questions about products and inventory
- Help customers find what they're looking for
- Be helpful, professional, and concise

Important rules:
- Never make up product information - always use the get_products tool
- Keep responses brief and conversational (this is a phone call)
- If you don't know something, be honest and offer to transfer to a human

The store you're representing is: ${shop}`}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #c4cdd5',
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontFamily: 'monospace',
                          resize: 'vertical',
                        }}
                      />
                      <s-text variant="bodySm" tone="subdued">
                        Instructions that define how the assistant behaves
                      </s-text>
                    </s-block-stack>

                    <s-inline-stack gap="200">
                      <s-button
                        type="submit"
                        variant="primary"
                        loading={isLoading}
                        disabled={isLoading}
                      >
                        Create Assistant
                      </s-button>
                      <s-button
                        type="button"
                        onClick={() => setShowAssistantForm(false)}
                        disabled={isLoading}
                      >
                        Cancel
                      </s-button>
                    </s-inline-stack>
                  </s-block-stack>
                </form>
              )}
            </s-block-stack>
          </s-card>
        ) : (
          <s-card>
            <s-block-stack gap="400">
              <s-block-stack gap="200">
                <s-text variant="headingMd" as="h2">
                  AI Assistant Configuration
                </s-text>
                <s-text tone="subdued">
                  Your VAPI assistant is active and ready to handle customer calls
                </s-text>
              </s-block-stack>

              <s-divider />

              <s-block-stack gap="300">
                <s-block-stack gap="100">
                  <s-text variant="bodySm" tone="subdued">Assistant Name</s-text>
                  <s-text variant="bodyMd" as="p">{assistant.name}</s-text>
                </s-block-stack>

                <s-block-stack gap="100">
                  <s-text variant="bodySm" tone="subdued">Assistant ID</s-text>
                  <s-text variant="bodySm" as="p">{assistant.id}</s-text>
                </s-block-stack>

                {assistant.voice && (
                  <>
                    <s-block-stack gap="100">
                      <s-text variant="bodySm" tone="subdued">Voice Provider</s-text>
                      <s-text variant="bodyMd" as="p">{assistant.voice.provider}</s-text>
                    </s-block-stack>

                    <s-block-stack gap="100">
                      <s-text variant="bodySm" tone="subdued">Voice</s-text>
                      <s-text variant="bodyMd" as="p">{assistant.voice.voiceId}</s-text>
                    </s-block-stack>
                  </>
                )}

                {assistant.model && (
                  <s-block-stack gap="100">
                    <s-text variant="bodySm" tone="subdued">AI Model</s-text>
                    <s-text variant="bodyMd" as="p">{assistant.model.model}</s-text>
                  </s-block-stack>
                )}
              </s-block-stack>

              <s-divider />

              <s-block-stack gap="200">
                <s-text tone="subdued" as="p">
                  Want to change your assistant's settings? Delete the current assistant and create a new one with custom configuration.
                </s-text>
                <s-button
                  tone="critical"
                  onClick={handleDeleteAssistant}
                  loading={isLoading}
                  disabled={isLoading}
                >
                  Delete & Recreate Assistant
                </s-button>
              </s-block-stack>
            </s-block-stack>
          </s-card>
        )}

        <s-card>
          <s-block-stack gap="400">
            <s-block-stack gap="200">
              <s-text variant="headingMd" as="h2">
                Phone Number
              </s-text>
              {phoneNumber ? (
                <s-text tone="subdued">
                  Your provisioned phone number is active and ready to receive calls
                </s-text>
              ) : (
                <s-text tone="subdued">
                  Provision a phone number to allow customers to call your AI receptionist
                </s-text>
              )}
            </s-block-stack>

            <s-divider />

            {phoneNumber ? (
              <s-block-stack gap="400">
                <s-inline-stack align="space-between" block-align="start" wrap="true">
                  <s-block-stack gap="200">
                    <s-text variant="headingLg" as="p">
                      {phoneNumber}
                    </s-text>
                    <s-badge tone="success">Active</s-badge>
                  </s-block-stack>

                  <s-button
                    tone="critical"
                    onClick={handleRelease}
                    loading={isLoading}
                    disabled={isLoading}
                  >
                    Release Number
                  </s-button>
                </s-inline-stack>

                <s-banner tone="info">
                  <s-block-stack gap="100">
                    <s-text variant="bodyMd" as="p">
                      <strong>Test your AI receptionist</strong>
                    </s-text>
                    <s-text as="p">
                      Call {phoneNumber} to speak with your AI assistant
                    </s-text>
                  </s-block-stack>
                </s-banner>
              </s-block-stack>
            ) : (
              <s-block-stack gap="300">
                <s-button
                  variant="primary"
                  onClick={handleProvision}
                  loading={isLoading}
                  disabled={isLoading || !hasAssistant}
                  size="large"
                >
                  Provision Phone Number!!!
                </s-button>

                {!hasAssistant && (
                  <s-text variant="bodySm" tone="subdued">
                    You must configure your AI assistant before provisioning a phone number
                  </s-text>
                )}
              </s-block-stack>
            )}
          </s-block-stack>
        </s-card>

        <s-card>
          <s-block-stack gap="300">
            <s-text variant="headingMd" as="h2">
              How it works
            </s-text>
            <s-block-stack gap="200">
              <s-text as="p">
                When you provision a phone number, customers can call your AI receptionist 24/7
                to get instant answers to their questions.
              </s-text>
              <s-text as="p" tone="subdued">
                Your AI assistant has access to your product catalog and can help customers
                find products, check availability, and answer common questions about your store.
              </s-text>
            </s-block-stack>
          </s-block-stack>
        </s-card>
      </s-block-stack>
    </s-page>
  );
}
