import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../dist/server/index.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3011);
const clientRoot = resolve(fileURLToPath(new URL("../dist/client/", import.meta.url)));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveStaticAsset(pathname, method, response) {
  if (method !== "GET" && method !== "HEAD") return false;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const assetPath = resolve(clientRoot, `.${decodedPath}`);
  if (assetPath !== clientRoot && !assetPath.startsWith(`${clientRoot}${sep}`)) {
    return false;
  }

  let assetStat;
  try {
    assetStat = await stat(assetPath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }

  if (!assetStat.isFile()) return false;

  response.writeHead(200, {
    "cache-control": decodedPath.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
    "content-length": assetStat.size,
    "content-type": contentTypes[extname(assetPath).toLowerCase()] || "application/octet-stream",
  });

  if (method === "HEAD") {
    response.end();
    return true;
  }

  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(assetPath);
    stream.on("error", rejectStream);
    response.on("finish", resolveStream);
    stream.pipe(response);
  });
  return true;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    const method = request.method || "GET";
    if (await serveStaticAsset(url.pathname, method, response)) return;

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
