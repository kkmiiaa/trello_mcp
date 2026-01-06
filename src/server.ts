import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { AppError, mapUnknownError, toErrorResponse } from "./errors.js";
import { registerPingRoutes } from "./routes/ping.js";
import { registerTrelloRoutes } from "./routes/trello.js";

export const createServer = () => {
  const fastify = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  if (config.internalToken) {
    fastify.addHook("onRequest", async (request) => {
      const provided = request.headers["x-internal-token"];
      if (!provided || Array.isArray(provided) || provided !== config.internalToken) {
        throw new AppError("FORBIDDEN", "Forbidden", 403);
      }
    });
  }

  fastify.setErrorHandler((error, _request, reply) => {
    const mapped = mapUnknownError(error);
    reply.status(mapped.status).send(toErrorResponse(mapped));
  });

  fastify.register(swagger, {
    openapi: {
      info: {
        title: "Trello Actions Proxy",
        version: config.serviceVersion
      }
    }
  });

  fastify.register(swaggerUi, {
    routePrefix: "/docs"
  });

  fastify.register(registerPingRoutes);
  fastify.register(registerTrelloRoutes);

  return fastify;
};

const start = async () => {
  const server = createServer();
  await server.listen({ port: config.port, host: config.host });
};

if (process.env.NODE_ENV !== "test") {
  start().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
