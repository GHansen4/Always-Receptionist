import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

// Load Shopify Polaris web components
if (typeof document !== 'undefined' && !document.querySelector('script[src*="polaris.js"]')) {
  const script = document.createElement('script');
  script.src = 'https://cdn.shopify.com/shopifycloud/polaris.js';
  script.defer = true;
  document.head.appendChild(script);
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
});
