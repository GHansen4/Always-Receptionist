import { useLoaderData, useSubmit, useNavigation } from "react-router";
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

// Action: Provision or release phone number
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
  const { phoneNumber, hasAssistant, assistant } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

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

  return (
    <s-page heading="Phone Numbers">
      <s-block-stack gap="500">
        {!hasAssistant && (
          <s-banner tone="warning">
            <p>Your AI assistant is not configured yet. Please complete setup first.</p>
          </s-banner>
        )}

        {assistant && (
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
                <s-inline-stack gap="400" wrap="false">
                  <s-block-stack gap="100" style={{minWidth: '140px'}}>
                    <s-text variant="bodySm" tone="subdued">Assistant Name</s-text>
                    <s-text variant="bodyMd" as="p">{assistant.name}</s-text>
                  </s-block-stack>

                  <s-block-stack gap="100" style={{minWidth: '200px'}}>
                    <s-text variant="bodySm" tone="subdued">Assistant ID</s-text>
                    <s-text variant="bodySm" as="p" style={{fontFamily: 'monospace', wordBreak: 'break-all'}}>
                      {assistant.id}
                    </s-text>
                  </s-block-stack>
                </s-inline-stack>

                {assistant.voice && (
                  <s-inline-stack gap="400" wrap="false">
                    <s-block-stack gap="100" style={{minWidth: '140px'}}>
                      <s-text variant="bodySm" tone="subdued">Voice Provider</s-text>
                      <s-text variant="bodyMd" as="p" style={{textTransform: 'capitalize'}}>
                        {assistant.voice.provider}
                      </s-text>
                    </s-block-stack>

                    <s-block-stack gap="100" style={{minWidth: '140px'}}>
                      <s-text variant="bodySm" tone="subdued">Voice</s-text>
                      <s-text variant="bodyMd" as="p" style={{textTransform: 'capitalize'}}>
                        {assistant.voice.voiceId}
                      </s-text>
                    </s-block-stack>
                  </s-inline-stack>
                )}

                {assistant.model && (
                  <s-block-stack gap="100" style={{minWidth: '140px'}}>
                    <s-text variant="bodySm" tone="subdued">AI Model</s-text>
                    <s-text variant="bodyMd" as="p">{assistant.model.model}</s-text>
                  </s-block-stack>
                )}
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
                  Provision Phone Number
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