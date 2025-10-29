export async function loader({ request }) {
  console.log("\n=== CATCH-ALL ROUTE HIT ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  console.log("Path:", new URL(request.url).pathname);
  console.log("========================\n");
  
  return { 
    message: "catch-all route working",
    path: new URL(request.url).pathname 
  };
}

export default function CatchAll() {
  return (
    <div>
      <h1>Catch-all route working</h1>
      <p>This route catches all unmatched paths.</p>
    </div>
  );
}

