import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { ClientRouter } from "react-router";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <ClientRouter />
    </StrictMode>
  );
});
