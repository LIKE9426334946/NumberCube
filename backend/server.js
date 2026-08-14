import { createServer } from "node:http";
import worker from "../dist/server/index.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3011);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    const method = request.method || "GET";
    const init = { method, headers: request.headers };

    if (method !== "GET" && method !== "HEAD") {
      init.body = request;
      init.duplex = "half";
    }

    const result = await worker.fetch(new Request(url, init));
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));

    if (!result.body) {
      response.end();
      return;
    }

    for await (const chunk of result.body) response.write(chunk);
    response.end();
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`NumberCube is running at http://${host}:${port}`);
});
