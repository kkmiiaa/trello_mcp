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
        path: "/1/members/me/boards?fields=id,name,desc,url,closed&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, [
        { id: "b1", name: "Board 1", desc: "Desc 1", url: "https://trello.com/b1", closed: false },
        { id: "b2", name: "Board 2", desc: "Desc 2", url: "https://trello.com/b2", closed: false },
        { id: "b3", name: "Board 3", desc: "Desc 3", url: "https://trello.com/b3", closed: false }
      ]);

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "b1,b2"
    });

    const response = await server.inject({ method: "GET", url: "/v1/trello/boards" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: "b1", name: "Board 1", desc: "Desc 1", url: "https://trello.com/b1", closed: false },
      { id: "b2", name: "Board 2", desc: "Desc 2", url: "https://trello.com/b2", closed: false }
    ]);

    await server.close();
    mockAgent.close();
  });

  it("returns board details for allowlisted board", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: "/1/boards/allowed?fields=id,name,desc,url,closed&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, {
        id: "allowed",
        name: "Board 1",
        desc: "Board desc",
        url: "https://trello.com/b1",
        closed: false
      });

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed"
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/trello/boards/allowed"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "allowed",
      name: "Board 1",
      desc: "Board desc",
      url: "https://trello.com/b1",
      closed: false
    });

    await server.close();
    mockAgent.close();
  });

  it("returns 403 for boardId outside allowlist", async () => {
    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed",
      INTERNAL_TOKEN: "internal-token",
      PREVIEW_TOKEN_SECRET: "preview-secret"
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
      TRELLO_ALLOWED_BOARD_IDS: "allowed",
      INTERNAL_TOKEN: "internal-token",
      PREVIEW_TOKEN_SECRET: "preview-secret"
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
        path: "/1/members/me/boards?fields=id,name,desc,url,closed&key=test-key&token=test-token",
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
      TRELLO_ALLOWED_BOARD_IDS: "allowed",
      INTERNAL_TOKEN: "internal-token",
      PREVIEW_TOKEN_SECRET: "preview-secret"
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
        path: "/1/cards/c1?fields=id,name,desc,url,idList,idBoard,due,dueComplete,closed,labels&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, cardFixture);

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed",
      INTERNAL_TOKEN: "internal-token",
      PREVIEW_TOKEN_SECRET: "preview-secret"
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

  it("previews createCard with internal token", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: "/1/lists/list1?fields=id,idBoard&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, { id: "list1", idBoard: "allowed" });
    trelloMock
      .intercept({
        path: "/1/lists/list1?fields=id,idBoard&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, { id: "list1", idBoard: "allowed" });

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed",
      INTERNAL_TOKEN: "internal-token",
      PREVIEW_TOKEN_SECRET: "preview-secret"
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/trello/write/preview",
      headers: {
        "x-internal-token": "internal-token"
      },
      payload: {
        action: "createCard",
        payload: {
          listId: "list1",
          name: "Task"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.preview.action).toBe("createCard");
    expect(body.commitToken).toBeTypeOf("string");

    await server.close();
    mockAgent.close();
  });

  it("previews batch operations", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: new RegExp("^/1/lists/list1\\?.*$"),
        method: "GET"
      })
      .reply(200, { id: "list1", idBoard: "allowed" })
      .persist();
    trelloMock
      .intercept({
        path: "/1/boards/allowed?fields=id,name,desc,url,closed&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, {
        id: "allowed",
        name: "Board 1",
        desc: "Board desc",
        url: "https://trello.com/b1",
        closed: false
      })
      .persist();

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed",
      INTERNAL_TOKEN: "internal-token",
      PREVIEW_TOKEN_SECRET: "preview-secret"
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/trello/write/preview",
      headers: {
        "x-internal-token": "internal-token"
      },
      payload: {
        action: "batch",
        payload: {
          operations: [
            { action: "createList", payload: { boardId: "allowed", name: "List 1" } },
            { action: "createCard", payload: { listId: "list1", name: "Task 1" } }
          ]
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.preview.action).toBe("batch");
    expect(body.commitToken).toBeTypeOf("string");

    await server.close();
    mockAgent.close();
  });

  it("commits createList after preview", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: "/1/boards/allowed?fields=id,name,desc,url,closed&key=test-key&token=test-token",
        method: "GET"
      })
      .reply(200, {
        id: "allowed",
        name: "Board 1",
        desc: "Board desc",
        url: "https://trello.com/b1",
        closed: false
      })
      .persist();
    trelloMock
      .intercept({
        path: new RegExp("^/1/boards/allowed/lists\\?.*$"),
        method: "POST"
      })
      .reply(200, { id: "list1", name: "List 1", closed: false });

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed",
      INTERNAL_TOKEN: "internal-token",
      PREVIEW_TOKEN_SECRET: "preview-secret"
    });

    const previewResponse = await server.inject({
      method: "POST",
      url: "/v1/trello/write/preview",
      headers: {
        "x-internal-token": "internal-token"
      },
      payload: {
        action: "createList",
        payload: {
          boardId: "allowed",
          name: "List 1"
        }
      }
    });
    const { commitToken } = previewResponse.json();

    const commitResponse = await server.inject({
      method: "POST",
      url: "/v1/trello/write/commit",
      headers: {
        "x-internal-token": "internal-token"
      },
      payload: {
        commitToken
      }
    });

    expect(commitResponse.statusCode).toBe(200);
    expect(commitResponse.json()).toEqual({
      action: "createList",
      result: { id: "list1", name: "List 1", closed: false }
    });

    await server.close();
    mockAgent.close();
  });

  it("commits createCard after preview", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: new RegExp("^/1/lists/list1\\?.*$"),
        method: "GET"
      })
      .reply(200, { id: "list1", idBoard: "allowed" })
      .persist();
    trelloMock
      .intercept({
        path: new RegExp("^/1/cards\\?.*$"),
        method: "POST"
      })
      .reply(200, cardFixture);

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed",
      INTERNAL_TOKEN: "internal-token",
      PREVIEW_TOKEN_SECRET: "preview-secret"
    });

    const previewResponse = await server.inject({
      method: "POST",
      url: "/v1/trello/write/preview",
      headers: {
        "x-internal-token": "internal-token"
      },
      payload: {
        action: "createCard",
        payload: {
          listId: "list1",
          name: "Task"
        }
      }
    });
    const { commitToken } = previewResponse.json();

    const commitResponse = await server.inject({
      method: "POST",
      url: "/v1/trello/write/commit",
      headers: {
        "x-internal-token": "internal-token"
      },
      payload: {
        commitToken
      }
    });

    expect(commitResponse.statusCode).toBe(200);
    expect(commitResponse.json()).toEqual({
      action: "createCard",
      result: cardFixture
    });

    await server.close();
    mockAgent.close();
  });

  it("commits batch createCard operations after preview", async () => {
    const mockAgent = setupMockAgent();
    const trelloMock = mockAgent.get("https://api.trello.com");
    trelloMock
      .intercept({
        path: new RegExp("^/1/lists/list1\\?.*$"),
        method: "GET"
      })
      .reply(200, { id: "list1", idBoard: "allowed" })
      .persist();
    trelloMock
      .intercept({
        path: new RegExp("^/1/cards\\?.*$"),
        method: "POST"
      })
      .reply(200, cardFixture)
      .persist();

    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed",
      INTERNAL_TOKEN: "internal-token",
      PREVIEW_TOKEN_SECRET: "preview-secret"
    });

    const previewResponse = await server.inject({
      method: "POST",
      url: "/v1/trello/write/preview",
      headers: {
        "x-internal-token": "internal-token"
      },
      payload: {
        action: "batch",
        payload: {
          operations: [
            { action: "createCard", payload: { listId: "list1", name: "Task 1" } },
            { action: "createCard", payload: { listId: "list1", name: "Task 2" } }
          ]
        }
      }
    });
    const { commitToken } = previewResponse.json();

    const commitResponse = await server.inject({
      method: "POST",
      url: "/v1/trello/write/commit",
      headers: {
        "x-internal-token": "internal-token"
      },
      payload: {
        commitToken
      }
    });

    expect(commitResponse.statusCode).toBe(200);
    const commitBody = commitResponse.json();
    expect(commitBody.action).toBe("batch");
    expect(commitBody.results).toHaveLength(2);

    await server.close();
    mockAgent.close();
  });

  it("rejects write preview without internal token", async () => {
    const server = await createServerWithEnv({
      TRELLO_ALLOWED_BOARD_IDS: "allowed"
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/trello/write/preview",
      payload: {
        action: "addComment",
        payload: {
          cardId: "c1",
          text: "hi"
        }
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Forbidden"
      }
    });

    await server.close();
  });
});
