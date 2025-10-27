import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  
  const vapiConfig = await db.vapiConfig.findUnique({
    where: { shop: session.shop }
  });

  return { vapiConfig };
}

export default function Settings() {
  const { vapiConfig } = useLoaderData();

  return (
    <Page title="VAPI Settings">
      <Card>
        <BlockStack gap="200">
          <Text variant="headingMd">Your VAPI Configuration</Text>
          <Text>Use this signature when configuring VAPI:</Text>
          <Text variant="bodyMd" fontWeight="bold">{vapiConfig?.vapiSignature}</Text>
          <Text tone="subdued" variant="bodySm">
            Add this to VAPI as a custom header: X-Vapi-Signature
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
