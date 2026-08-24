import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 54321;

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json");

  if (request.url === "/auth/v1/health") {
    response.writeHead(200);
    response.end(JSON.stringify({ status: "ok", testStub: true }));
    return;
  }

  if (request.url?.startsWith("/auth/v1/user")) {
    response.writeHead(401);
    response.end(JSON.stringify({ message: "No test session" }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ message: "Phase 0 test stub endpoint not found" }));
});

server.listen(port, host, () => {
  console.log(`Phase 0 Supabase Auth stub listening at http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
