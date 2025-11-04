import { useState, useEffect } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  createPhoneNumber
} from "../utils/vapi.server";

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
    let phoneNumbers = [];

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

    // Fetch phone numbers from VAPI
    try {
      const phoneResponse = await fetch("https://api.vapi.ai/phone-number", {
        headers: {
          'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`
        }
      });

      if (phoneResponse.ok) {
        phoneNumbers = await phoneResponse.json();
        console.log("✅ Fetched phone numbers:", phoneNumbers.length);
      }
    } catch (phoneError) {
      console.log("⚠️ Error fetching phone numbers:", phoneError.message);
    }

    return {
      hasAssistant: !!vapiConfig?.assistantId,
      assistant,
      phoneNumbers,
      shop: session.shop,
    };
  } catch (error) {
    console.error("❌ ASSISTANT LOADER ERROR:", error.message);
    if (error.status === 401 || error.statusCode === 401) {
      throw error;
    }
    return {
      error: error.message,
      hasAssistant: false,
      assistant: null,
      phoneNumbers: [],
      shop: null
    };
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
- Assist with order status inquiries
- Be helpful, professional, and concise

Important rules:
- Never make up product information - always use the available tools
- Keep responses brief and conversational (this is a phone call)
- If you don't know something, be honest and offer to transfer to a human

Available tools:
- get_products: List available products in the store
- search_products: Search for specific products by keyword
- check_order_status: Look up order information by order number or email

The store you're representing is: ${session.shop}`;

      const payload = {
        name: assistantName,
        model: {
          provider: "openai",
          model: model,
          temperature: temperature,
          systemPrompt: systemPrompt,
          tools: [
            {
              type: "function",
              function: {
                name: "get_products",
                description: "Get a list of available products from the store. Use this when customers ask 'what products do you have' or want to browse.",
                parameters: {
                  type: "object",
                  properties: {
                    limit: {
                      type: "number",
                      description: "Maximum number of products to return (default: 10)"
                    }
                  }
                }
              },
              messages: [
                {
                  type: "request-start",
                  content: "Let me check what products we have available..."
                }
              ]
            },
            {
              type: "function",
              function: {
                name: "search_products",
                description: "Search for products by keyword, name, category, or description. Use this when customers are looking for something specific.",
                parameters: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "Search keyword or phrase (e.g., 'laptop', 'red shoes', 'winter jacket')"
                    }
                  },
                  required: ["query"]
                }
              },
              messages: [
                {
                  type: "request-start",
                  content: "Let me search for that..."
                }
              ]
            },
            {
              type: "function",
              function: {
                name: "check_order_status",
                description: "Look up order status and details. Use this when customers ask about their order.",
                parameters: {
                  type: "object",
                  properties: {
                    orderNumber: {
                      type: "string",
                      description: "Order number (e.g., '#1001')"
                    },
                    email: {
                      type: "string",
                      description: "Customer email address"
                    }
                  }
                }
              },
              messages: [
                {
                  type: "request-start",
                  content: "Let me look up that order for you..."
                }
              ]
            }
          ]
        },
        voice: {
          provider: voiceProvider,
          voiceId: voiceId,
        },
        firstMessage: firstMessage,
        endCallMessage: endCallMessage,
        serverUrl: `https://always-receptionist.vercel.app/api/vapi/functions`,
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

    if (action === "update_assistant") {
      console.log("Updating VAPI assistant...");

      const vapiConfig = await prisma.vapiConfig.findUnique({
        where: { shop: session.shop }
      });

      if (!vapiConfig?.assistantId) {
        return {
          success: false,
          error: "No assistant found to update"
        };
      }

      // Get form data
      const firstMessage = formData.get("firstMessage");
      const voiceId = formData.get("voiceId");
      const systemPrompt = formData.get("systemPrompt");

      // Build update payload
      const payload = {
        voice: {
          provider: "openai",
          voiceId: voiceId,
        },
        firstMessage: firstMessage,
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          temperature: 0.7,
          systemPrompt: systemPrompt,
          tools: [
            {
              type: "function",
              function: {
                name: "get_products",
                description: "Get a list of available products from the store. Use this when customers ask 'what products do you have' or want to browse.",
                parameters: {
                  type: "object",
                  properties: {
                    limit: {
                      type: "number",
                      description: "Maximum number of products to return (default: 10)"
                    }
                  }
                }
              },
              messages: [
                {
                  type: "request-start",
                  content: "Let me check what products we have available..."
                }
              ]
            },
            {
              type: "function",
              function: {
                name: "search_products",
                description: "Search for products by keyword, name, category, or description. Use this when customers are looking for something specific.",
                parameters: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "Search keyword or phrase (e.g., 'laptop', 'red shoes', 'winter jacket')"
                    }
                  },
                  required: ["query"]
                }
              },
              messages: [
                {
                  type: "request-start",
                  content: "Let me search for that..."
                }
              ]
            },
            {
              type: "function",
              function: {
                name: "check_order_status",
                description: "Look up order status and details. Use this when customers ask about their order.",
                parameters: {
                  type: "object",
                  properties: {
                    orderNumber: {
                      type: "string",
                      description: "Order number (e.g., '#1001')"
                    },
                    email: {
                      type: "string",
                      description: "Customer email address"
                    }
                  }
                }
              },
              messages: [
                {
                  type: "request-start",
                  content: "Let me look up that order for you..."
                }
              ]
            }
          ]
        },
        serverUrl: `https://always-receptionist.vercel.app/api/vapi/functions`,
        serverUrlSecret: vapiConfig.vapiSignature,
      };

      const response = await fetch(`https://api.vapi.ai/assistant/${vapiConfig.assistantId}`, {
        method: "PATCH",
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
          error: `Failed to update assistant: ${errorText}`
        };
      }

      console.log("✅ Assistant updated successfully");

      return {
        success: true,
        message: "Assistant settings updated successfully!"
      };
    }

    if (action === "create_phone") {
      console.log("Creating new phone number via VAPI...");

      const vapiConfig = await prisma.vapiConfig.findUnique({
        where: { shop: session.shop }
      });

      if (!vapiConfig?.assistantId) {
        return {
          success: false,
          error: "No assistant found. Please create an assistant first."
        };
      }

      const shopName = session.shop.replace('.myshopify.com', '');

      try {
        // Create the phone number and auto-associate with assistant
        const phoneNumber = await createPhoneNumber({
          provider: "vapi",
          name: `${shopName} - AI Receptionist`,
          assistantId: vapiConfig.assistantId,
        });

        console.log("✅ Phone number created and associated:", phoneNumber.number || phoneNumber.id);

        // Store the phone number info in VapiConfig
        await prisma.vapiConfig.update({
          where: { shop: session.shop },
          data: {
            phoneNumber: phoneNumber.number,
            phoneNumberId: phoneNumber.id
          }
        });

        return {
          success: true,
          message: `Phone number ${phoneNumber.number} created and associated successfully!`,
          phoneNumber: phoneNumber.number
        };

      } catch (error) {
        console.error("❌ Failed to create phone number:", error);
        return {
          success: false,
          error: `Failed to create phone number: ${error.message}`
        };
      }
    }

    if (action === "associate_phone") {
      console.log("Associating phone number with assistant...");

      const vapiConfig = await prisma.vapiConfig.findUnique({
        where: { shop: session.shop }
      });

      if (!vapiConfig?.assistantId) {
        return {
          success: false,
          error: "No assistant found to associate"
        };
      }

      const phoneNumberId = formData.get("phoneNumberId");

      if (!phoneNumberId) {
        return {
          success: false,
          error: "Please select a phone number"
        };
      }

      const response = await fetch(`https://api.vapi.ai/phone-number/${phoneNumberId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantId: vapiConfig.assistantId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("VAPI API error:", errorText);
        return {
          success: false,
          error: `Failed to associate phone number: ${errorText}`
        };
      }

      console.log("✅ Phone number associated successfully");

      return {
        success: true,
        message: "Phone number associated with assistant successfully!"
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
  const { hasAssistant, assistant, phoneNumbers, shop } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showCreatePhoneForm, setShowCreatePhoneForm] = useState(false);

  // Close forms on successful action
  useEffect(() => {
    if (actionData?.success) {
      setShowCreateForm(false);
      setShowEditForm(false);
      setShowCreatePhoneForm(false);
    }
  }, [actionData]);

  const handleCreateAssistant = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.append("action", "create_assistant");
    submit(formData, { method: "post" });
  };

  const handleUpdateAssistant = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.append("action", "update_assistant");
    submit(formData, { method: "post" });
  };

  const handleDeleteAssistant = () => {
    if (confirm("Are you sure you want to delete this assistant? This will disconnect it from your store.")) {
      const formData = new FormData();
      formData.append("action", "delete_assistant");
      submit(formData, { method: "post" });
    }
  };

  const handleAssociatePhone = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.append("action", "associate_phone");
    submit(formData, { method: "post" });
  };

  const handleCreatePhone = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.append("action", "create_phone");
    submit(formData, { method: "post" });
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
          <>
            <s-banner tone="info">
              <s-block-stack gap="200">
                <s-text as="p">
                  <strong>Setup Steps:</strong>
                </s-text>
                <s-text as="p">
                  1️⃣ Create your AI assistant (configure voice and behavior)
                </s-text>
                <s-text as="p">
                  2️⃣ Create or connect a phone number
                </s-text>
                <s-text as="p">
                  3️⃣ Start receiving calls!
                </s-text>
              </s-block-stack>
            </s-banner>

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
                    <s-option value="alloy">Alloy (Neutral)</s-option>
                    <s-option value="echo">Echo (Male)</s-option>
                    <s-option value="fable">Fable (British Male)</s-option>
                    <s-option value="onyx">Onyx (Deep Male)</s-option>
                    <s-option value="nova">Nova (Female)</s-option>
                    <s-option value="shimmer">Shimmer (Soft Female)</s-option>
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

Important: Never make up product information - always use the getProductInfo tool.`}
                    help-text="Tell the assistant about your business and how to help customers"
                  />

                  {/* Hidden fields for defaults */}
                  <input type="hidden" name="voiceProvider" value="openai" />
                  <input type="hidden" name="assistantName" value={`${shopName} Receptionist`} />
                  <input type="hidden" name="endCallMessage" value="Thanks for calling! Have a great day!" />
                  <input type="hidden" name="model" value="gpt-4o-mini" />
                  <input type="hidden" name="temperature" value="0.7" />

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
          </>
        ) : (
          <s-section heading="AI Assistant Configuration">
            {!showEditForm ? (
              <s-stack direction="block" gap="base">
                <s-text as="p">
                  <strong>Greeting Message:</strong> {assistant?.firstMessage || 'Not set'}
                </s-text>

                {assistant?.voice && (
                  <s-text as="p">
                    <strong>Voice:</strong> {assistant.voice.voiceId}
                  </s-text>
                )}

                {assistant?.model && (
                  <s-text as="p">
                    <strong>About Your Business:</strong> {assistant.model.systemPrompt?.substring(0, 100)}...
                  </s-text>
                )}

                <s-stack direction="inline" gap="base">
                  <s-button
                    variant="primary"
                    onClick={() => setShowEditForm(true)}
                  >
                    Edit Settings
                  </s-button>
                  <s-button
                    tone="critical"
                    onClick={handleDeleteAssistant}
                    {...(isLoading ? { loading: true } : {})}
                  >
                    Delete Assistant
                  </s-button>
                </s-stack>
              </s-stack>
            ) : (
              <form onSubmit={handleUpdateAssistant}>
                <s-stack direction="block" gap="large">
                  <s-text-field
                    label="Greeting Message"
                    name="firstMessage"
                    value={assistant?.firstMessage || ""}
                    help-text="What the assistant says when answering the call"
                  />

                  <s-select
                    label="Voice Selection"
                    name="voiceId"
                    value={assistant?.voice?.voiceId || "echo"}
                  >
                    <s-option value="alloy">Alloy (Neutral)</s-option>
                    <s-option value="echo">Echo (Male)</s-option>
                    <s-option value="fable">Fable (British Male)</s-option>
                    <s-option value="onyx">Onyx (Deep Male)</s-option>
                    <s-option value="nova">Nova (Female)</s-option>
                    <s-option value="shimmer">Shimmer (Soft Female)</s-option>
                  </s-select>

                  <s-text-field
                    label="About Your Business"
                    name="systemPrompt"
                    multiline="6"
                    value={assistant?.model?.systemPrompt || ""}
                    help-text="Tell the assistant about your business and how to help customers"
                  />

                  <s-stack direction="inline" gap="base">
                    <s-button
                      type="submit"
                      variant="primary"
                      {...(isLoading ? { loading: true } : {})}
                    >
                      Save Changes
                    </s-button>
                    <s-button
                      type="button"
                      onClick={() => setShowEditForm(false)}
                      disabled={isLoading}
                    >
                      Cancel
                    </s-button>
                  </s-stack>
                </s-stack>
              </form>
            )}
          </s-section>
        )}

        {hasAssistant && phoneNumbers && phoneNumbers.length > 0 && (
          <s-section heading="Phone Number">
            <s-text as="p">
              Associate your assistant with a phone number from your VAPI account.
            </s-text>

            <form onSubmit={handleAssociatePhone}>
              <s-stack direction="block" gap="base">
                <s-select
                  label="Select Phone Number"
                  name="phoneNumberId"
                  value={phoneNumbers.find(p => p.assistantId === assistant?.id)?.id || ""}
                >
                  <s-option value="">Choose a phone number</s-option>
                  {phoneNumbers.map((phone) => (
                    <s-option key={phone.id} value={phone.id}>
                      {phone.number || phone.name || phone.id}
                      {phone.assistantId === assistant?.id ? ' (Currently associated)' : ''}
                    </s-option>
                  ))}
                </s-select>

                <s-stack direction="inline" gap="base">
                  <s-button
                    type="submit"
                    variant="primary"
                    {...(isLoading ? { loading: true } : {})}
                  >
                    Associate Phone Number
                  </s-button>
                  <s-button
                    type="button"
                    onClick={() => setShowCreatePhoneForm(true)}
                    disabled={isLoading}
                  >
                    Create New Phone Number
                  </s-button>
                </s-stack>
              </s-stack>
            </form>

            {showCreatePhoneForm && (
              <s-box padding="large" borderWidth="base" borderRadius="base" background="subdued">
                <form onSubmit={handleCreatePhone}>
                  <s-stack direction="block" gap="base">
                    <s-text variant="headingSm" as="h3">Create Additional Phone Number</s-text>

                    <s-text as="p">
                      VAPI will provision a new phone number that will be automatically
                      associated with your assistant.
                    </s-text>

                    <s-text-field
                      label="Preferred Area Code (Optional)"
                      name="areaCode"
                      placeholder="e.g., 415, 212, 310"
                      help-text="Leave blank for automatic assignment. US numbers only."
                    />

                    <s-banner tone="warning">
                      <s-text as="p">
                        <strong>Note:</strong> Each phone number is billed separately by VAPI.
                      </s-text>
                    </s-banner>

                    <s-stack direction="inline" gap="base">
                      <s-button
                        type="submit"
                        variant="primary"
                        {...(isLoading ? { loading: true } : {})}
                      >
                        Create Phone Number
                      </s-button>
                      <s-button
                        type="button"
                        onClick={() => setShowCreatePhoneForm(false)}
                        disabled={isLoading}
                      >
                        Cancel
                      </s-button>
                    </s-stack>
                  </s-stack>
                </form>
              </s-box>
            )}
          </s-section>
        )}

        {hasAssistant && phoneNumbers && phoneNumbers.length === 0 && (
          <s-section heading="Phone Number">
            <s-banner tone="info">
              <p>You need a phone number for customers to call your AI assistant.</p>
            </s-banner>

            {!showCreatePhoneForm ? (
              <s-button
                variant="primary"
                onClick={() => setShowCreatePhoneForm(true)}
              >
                Create Phone Number
              </s-button>
            ) : (
              <form onSubmit={handleCreatePhone}>
                <s-stack direction="block" gap="large">
                  <s-text variant="headingSm" as="h3">Create a New Phone Number</s-text>

                  <s-text as="p">
                    VAPI will automatically provision a new US phone number for your AI receptionist.
                    This number will be automatically associated with your assistant.
                  </s-text>

                  <s-banner tone="warning">
                    <p><strong>Important:</strong> Phone numbers are billed separately by VAPI. Check VAPI pricing for details.</p>
                  </s-banner>

                  <s-stack direction="inline" gap="base">
                    <s-button
                      type="submit"
                      variant="primary"
                      {...(isLoading ? { loading: true } : {})}
                    >
                      Create & Associate Phone Number
                    </s-button>
                    <s-button
                      type="button"
                      onClick={() => setShowCreatePhoneForm(false)}
                      disabled={isLoading}
                    >
                      Cancel
                    </s-button>
                  </s-stack>
                </s-stack>
              </form>
            )}
          </s-section>
        )}
      </s-block-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
