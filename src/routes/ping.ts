import { FastifyInstance } from "fastify";
import { config } from "../config.js";

export const registerPingRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    "/v1/ping",
    {
      schema: {
        description: "Service health check",
        tags: ["system"],
        response: {
          200: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              service: { type: "string" },
              version: { type: "string" }
            },
            required: ["ok", "service", "version"]
          }
        }
      }
    },
    async () => ({
      ok: true,
      service: config.serviceName,
      version: config.serviceVersion
    })
  );
};
