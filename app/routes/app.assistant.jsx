import { useState } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Loader: Check if assistant exists
export async function loader({ request }) {
  console.log("\n=== ASSISTANT ROUTE LOADER ===");

  try {
    const { session } = await authenticate.admin(request);
    console.log("✅ Authenticated:", session.shop);

    const vapiConfig = await prisma.vapiConfig.findUnique({
      where: { shop: session.shop },
      select: {
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
        }
      } catch (vapiError) {
        console.log("⚠️ Error fetching assistant:", vapiError.message);
      }
    }

    return {
      hasAssistant: !!vapiConfig?.assistantId,
      assistant,
      shop: session.shop,
    };
  } catch (error) {
    console.error("❌ ASSISTANT LOADER ERROR:", error.message);
    if (error.status === 401 || error.statusCode === 401) {
      throw error;
    }
    return { error: error.message };
  }
}

// Action: Create or delete assistant
export async function action({ request }) {
  console.log("\n=== ASSISTANT ROUTE ACTION ===");

  try {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "create_assistant") {
      console.log("Creating new VAPI assistant...");

      // Get or create vapiConfig with signature
      let vapiConfig = await prisma.vapiConfig.findUnique({
        where: { shop: session.shop }
      });

      if (!vapiConfig) {
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
      const firstMessage = formData.get("firstMessage") || "Hi! Thanks for calling. How can I help you today?";
      const endCallMessage = formData.get("endCallMessage") || "Thanks for calling! Have a great day!";
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

      await prisma.vapiConfig.update({
        where: { shop: session.shop },
        data: { assistantId: assistant.id }
      });

      return {
        success: true,
        message: "Assistant created successfully!",
      };
    }

    if (action === "delete_assistant") {
      const vapiConfig = await prisma.vapiConfig.findUnique({
        where: { shop: session.shop }
      });

      if (vapiConfig?.assistantId) {
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

        await prisma.vapiConfig.update({
          where: { shop: session.shop },
          data: { assistantId: null }
        });
      }

      return {
        success: true,
        message: "Assistant deleted successfully. You can now create a new one."
      };
    }

    return { success: false, error: "Invalid action" };

  } catch (error) {
    console.error("❌ ASSISTANT ACTION ERROR:", error.message);
    if (error.status === 401 || error.statusCode === 401) {
      throw error;
    }
    return {
      success: false,
      error: error.message
    };
  }
}

export default function Assistant() {
  const { hasAssistant, assistant, shop } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleCreateAssistant = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.append("action", "create_assistant");
    submit(formData, { method: "post" });
  };

  const handleDeleteAssistant = () => {
    if (confirm("Are you sure you want to delete this assistant? This will disconnect it from your store.")) {
      const formData = new FormData();
      formData.append("action", "delete_assistant");
      submit(formData, { method: "post" });
    }
  };

  const shopName = shop?.replace('.myshopify.com', '') || '';

  return (
    <s-page heading="AI Assistant">
      <s-block-stack gap="500">
        {actionData?.success && (
          <s-banner tone="success">
            <p>{actionData.message}</p>
          </s-banner>
        )}

        {actionData?.error && (
          <s-banner tone="critical">
            <p>Error: {actionData.error}</p>
          </s-banner>
        )}

        {!hasAssistant ? (
          <s-section heading="Create AI Assistant">
            <s-text as="p">
              Set up your AI assistant to handle customer calls. Configure the voice, behavior, and responses.
            </s-text>

            {!showCreateForm ? (
              <s-button
                variant="primary"
                size="large"
                onClick={() => setShowCreateForm(true)}
              >
                Create Assistant
              </s-button>
            ) : (
              <form onSubmit={handleCreateAssistant}>
                <s-stack direction="block" gap="large">
                  {/* Step 1: Basic Setup */}
                  <s-text variant="headingSm" as="h3">Step 1: Basic Setup</s-text>

                  <s-text-field
                    label="Greeting Message"
                    name="firstMessage"
                    value="Hi! Thanks for calling. How can I help you today?"
                    help-text="What the assistant says when answering the call"
                  />

                  <s-select
                    label="Voice Selection"
                    name="voiceId"
                    value="echo"
                  >
                    <option value="alloy">Alloy (Neutral)</option>
                    <option value="echo">Echo (Male)</option>
                    <option value="fable">Fable (British Male)</option>
                    <option value="onyx">Onyx (Deep Male)</option>
                    <option value="nova">Nova (Female)</option>
                    <option value="shimmer">Shimmer (Soft Female)</option>
                  </s-select>

                  <s-text-field
                    label="About Your Business"
                    name="systemPrompt"
                    multiline="6"
                    value={`You are a friendly AI receptionist for ${shopName}.

Your role:
- Answer questions about products and inventory
- Help customers find what they're looking for
- Be helpful, professional, and concise

Important: Never make up product information - always use the get_products tool.`}
                    help-text="Tell the assistant about your business and how to help customers"
                  />

                  {/* Advanced Section (Collapsible) */}
                  <s-stack direction="block" gap="base">
                    <s-button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      variant="plain"
                    >
                      {showAdvanced ? '▼' : '▶'} Advanced Settings
                    </s-button>

                    {showAdvanced && (
                      <s-stack direction="block" gap="large">
                        <s-select
                          label="Response Speed"
                          name="model"
                          value="gpt-4o-mini"
                        >
                          <option value="gpt-4o-mini">Faster (GPT-4o Mini)</option>
                          <option value="gpt-4o">Balanced (GPT-4o)</option>
                          <option value="gpt-4-turbo">Comprehensive (GPT-4 Turbo)</option>
                        </s-select>

                        <s-select
                          label="Interruption Handling"
                          name="temperature"
                          value="0.7"
                        >
                          <option value="0.3">More Focused (Less likely to be interrupted)</option>
                          <option value="0.7">Balanced</option>
                          <option value="1.0">More Creative (May allow more interruptions)</option>
                        </s-select>

                        <s-select
                          label="Voicemail Detection"
                          name="voicemailEnabled"
                          value="false"
                        >
                          <option value="false">Disabled</option>
                          <option value="true">Enabled (Detect and handle voicemail)</option>
                        </s-select>
                      </s-stack>
                    )}
                  </s-stack>

                  {/* Hidden fields for defaults */}
                  <input type="hidden" name="voiceProvider" value="openai" />
                  <input type="hidden" name="assistantName" value={`${shopName} Receptionist`} />
                  <input type="hidden" name="endCallMessage" value="Thanks for calling! Have a great day!" />

                  <s-stack direction="inline" gap="base">
                    <s-button
                      type="submit"
                      variant="primary"
                      {...(isLoading ? { loading: true } : {})}
                    >
                      Create Assistant
                    </s-button>
                    <s-button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      disabled={isLoading}
                    >
                      Cancel
                    </s-button>
                  </s-stack>
                </s-stack>
              </form>
            )}
          </s-section>
        ) : (
          <s-section heading="AI Assistant Configuration">
            <s-stack direction="block" gap="base">
              <s-text as="p">
                <strong>Assistant Name:</strong> {assistant?.name || 'Loading...'}
              </s-text>

              {assistant?.voice && (
                <>
                  <s-text as="p">
                    <strong>Voice Provider:</strong> {assistant.voice.provider}
                  </s-text>
                  <s-text as="p">
                    <strong>Voice:</strong> {assistant.voice.voiceId}
                  </s-text>
                </>
              )}

              {assistant?.model && (
                <s-text as="p">
                  <strong>AI Model:</strong> {assistant.model.model}
                </s-text>
              )}

              <s-text tone="subdued" as="p">
                Want to change settings? Delete this assistant and create a new one with different configuration.
              </s-text>

              <s-button
                tone="critical"
                onClick={handleDeleteAssistant}
                {...(isLoading ? { loading: true } : {})}
              >
                Delete Assistant
              </s-button>
            </s-stack>
          </s-section>
        )}
      </s-block-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
