import { describe, expect, it } from "vitest";
import { createServerWithEnv, setupMockAgent } from "./testHelpers.js";

describe("Trello routes", () => {
  const cardFixture = {
    id: "c1",
    name: "Card 1",
    desc: "Test card",
    url: "https://trello.com/c1",
    idList: "l1",
    idBoard: "allowed",
    due: null,
    dueComplete: false,
    closed: false,
    labels: []
  };

  it("filters boards by allowlist", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: "/1/members/me/boards?fields=id,name,url,closed&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, [
        { id: "b1", name: "Board 1", url: "https://trello.com/b1", closed: false },
        { id: "b2", name: "Board 2", url: "https://trello.com/b2", closed: false },
        { id: "b3", name: "Board 3", url: "https://trello.com/b3", closed: false }
      ]);

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "b1,b2"
    });

    const response = await server.inject({ method: "GET", url: "/v1/trello/boards" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: "b1", name: "Board 1", url: "https://trello.com/b1", closed: false },
      { id: "b2", name: "Board 2", url: "https://trello.com/b2", closed: false }
    ]);

    await server.close();
    mockAgent.close();
  });

  it("returns 403 for boardId outside allowlist", async () => {
    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed"
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/trello/boards/blocked/lists"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Board access is not allowed"
      }
    });

    await server.close();
  });

  it("maps Trello 401 to TRELLO_UNAUTHORIZED", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: "/1/boards/allowed/lists?fields=id,name,closed&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(401, { message: "unauthorized" });

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed"
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/trello/boards/allowed/lists"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "TRELLO_UNAUTHORIZED",
        message: "Trello authentication failed"
      }
    });

    await server.close();
    mockAgent.close();
  });

  it("maps Trello 429 to TRELLO_RATE_LIMIT", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: "/1/members/me/boards?fields=id,name,url,closed&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(429, { message: "rate limit" });

    const server = await createServerWithEnv();
    const response = await server.inject({ method: "GET", url: "/v1/trello/boards" });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "TRELLO_RATE_LIMIT",
        message: "Trello rate limit exceeded"
      }
    });

    await server.close();
    mockAgent.close();
  });

  it("blocks list cards when board is not allowlisted", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: "/1/lists/list1?fields=id,idBoard&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, { id: "list1", idBoard: "blocked" });

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed"
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/trello/lists/list1/cards"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Board access is not allowed"
      }
    });

    await server.close();
    mockAgent.close();
  });

  it("returns card details for allowlisted board", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path:
          "/1/cards/c1?fields=id,name,desc,url,idList,idBoard,due,dueComplete,closed,labels&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, cardFixture);

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed"
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/trello/cards/c1"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(cardFixture);

    await server.close();
    mockAgent.close();
  });
});
