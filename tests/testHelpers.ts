import { MockAgent, setGlobalDispatcher } from "undici";
import { vi } from "vitest";
import type { FastifyInstance } from "fastify";

const baseEnv = {
  NODE_ENV: "test",
  TRELLO_API_KEY: "test-key",
  TRELLO_API_TOKEN: "test-token",
  TRELLO_ALLOWED_BOARD_IDS: "",
  HOST: "127.0.0.1",
  PORT: "3000"
};

export const createServerWithEnv = async (
  overrides: Partial<NodeJS.ProcessEnv> = {}
): Promise<FastifyInstance> => {
  vi.resetModules();
  process.env = {
    ...process.env,
    ...baseEnv,
    ...overrides
  };

  const { createServer } = await import("../src/server.js");
  const server = createServer();
  await server.ready();
  return server;
};

export const setupMockAgent = () => {
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  return mockAgent;
};
