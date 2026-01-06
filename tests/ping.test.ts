import { afterAll, describe, expect, it } from "vitest";
import { createServerWithEnv } from "./testHelpers.js";

describe("GET /v1/ping", () => {
  let server: Awaited<ReturnType<typeof createServerWithEnv>>;

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it("returns service metadata", async () => {
    server = await createServerWithEnv();
    const response = await server.inject({ method: "GET", url: "/v1/ping" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "trello-actions-proxy",
      version: "0.1.0"
    });
  });
});
