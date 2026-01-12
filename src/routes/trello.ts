import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import {
  addComment,
  createCard,
  createLabel,
  createList,
  ensureBoardAllowed,
  getBoard,
  getCard,
  getListInfo,
  listBoards,
  listCardsForBoard,
  listCardsForList,
  listLists,
  updateBoard,
  updateCard,
  updateList
} from "../services/trelloClient.js";
import {
  PreviewAction,
  generatePreviewToken,
  verifyPreviewToken
} from "../services/previewToken.js";

const boardIdSchema = z.object({
  boardId: z.string().min(1)
});

const listIdSchema = z.object({
  listId: z.string().min(1)
});

const cardIdSchema = z.object({
  cardId: z.string().min(1)
});

const previewRequestSchema = z.object({
  action: z.enum([
    "createCard",
    "addComment",
    "updateCard",
    "createLabel",
    "createList",
    "updateList",
    "updateBoard",
    "batch"
  ]),
  payload: z.record(z.unknown())
});

const commitRequestSchema = z.object({
  commitToken: z.string().min(1)
});

const createCardPayloadSchema = z.object({
  listId: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().optional(),
  due: z.string().nullable().optional(),
  dueComplete: z.boolean().optional(),
  labelIds: z.array(z.string()).optional()
});

const createListPayloadSchema = z.object({
  boardId: z.string().min(1),
  name: z.string().min(1),
  pos: z.string().optional()
});

const createLabelPayloadSchema = z
  .object({
    boardId: z.string().min(1),
    name: z.string().optional(),
    color: z.string().nullable().optional()
  })
  .refine((payload) => payload.name !== undefined || payload.color !== undefined, {
    message: "Either name or color must be provided"
  });

const updateListPayloadSchema = z.object({
  listId: z.string().min(1),
  name: z.string().optional(),
  closed: z.boolean().optional(),
  pos: z.string().optional()
});

const updateBoardPayloadSchema = z.object({
  boardId: z.string().min(1),
  name: z.string().optional(),
  desc: z.string().optional(),
  closed: z.boolean().optional()
});

const addCommentPayloadSchema = z.object({
  cardId: z.string().min(1),
  text: z.string().min(1)
});

const updateCardPayloadSchema = z.object({
  cardId: z.string().min(1),
  name: z.string().optional(),
  desc: z.string().optional(),
  due: z.string().nullable().optional(),
  dueComplete: z.boolean().optional(),
  closed: z.boolean().optional(),
  listId: z.string().optional(),
  labelIds: z.array(z.string()).optional()
});

const batchPayloadSchema = z.object({
  operations: z.array(
    z.object({
      action: z.enum([
        "createCard",
        "addComment",
        "updateCard",
        "createLabel",
        "createList",
        "updateList",
        "updateBoard"
      ]),
      payload: z.record(z.unknown())
    })
  )
});

type WriteOperation =
  | { action: "createCard"; payload: z.infer<typeof createCardPayloadSchema> }
  | { action: "createLabel"; payload: z.infer<typeof createLabelPayloadSchema> }
  | { action: "createList"; payload: z.infer<typeof createListPayloadSchema> }
  | { action: "updateList"; payload: z.infer<typeof updateListPayloadSchema> }
  | { action: "updateBoard"; payload: z.infer<typeof updateBoardPayloadSchema> }
  | { action: "addComment"; payload: z.infer<typeof addCommentPayloadSchema> }
  | { action: "updateCard"; payload: z.infer<typeof updateCardPayloadSchema> };

const parseOperation = (action: WriteOperation["action"], payload: unknown): WriteOperation => {
  if (action === "createCard") {
    return { action, payload: createCardPayloadSchema.parse(payload) };
  }
  if (action === "createList") {
    return { action, payload: createListPayloadSchema.parse(payload) };
  }
  if (action === "createLabel") {
    return { action, payload: createLabelPayloadSchema.parse(payload) };
  }
  if (action === "updateList") {
    return { action, payload: updateListPayloadSchema.parse(payload) };
  }
  if (action === "updateBoard") {
    return { action, payload: updateBoardPayloadSchema.parse(payload) };
  }
  if (action === "addComment") {
    return { action, payload: addCommentPayloadSchema.parse(payload) };
  }
  return { action, payload: updateCardPayloadSchema.parse(payload) };
};

const cardResponseSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    desc: { type: "string" },
    url: { type: "string" },
    idList: { type: "string" },
    idBoard: { type: "string" },
    due: { type: ["string", "null"] },
    dueComplete: { type: "boolean" },
    closed: { type: "boolean" },
    labels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          color: { type: ["string", "null"] }
        },
        required: ["id", "name"]
      }
    }
  },
  required: ["id", "name", "desc", "url", "idList", "idBoard", "dueComplete", "closed", "labels"]
};

const requireWriteToken = (request: { headers: Record<string, unknown> }) => {
  if (!config.internalToken) {
    throw new AppError("FORBIDDEN", "Write access is not configured", 403);
  }
  const provided = request.headers["x-internal-token"];
  if (!provided || Array.isArray(provided) || provided !== config.internalToken) {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }
};

const toPreviewResponse = (action: PreviewAction, payload: Record<string, unknown>) => {
  const exp = Date.now() + 5 * 60 * 1000;
  const token = generatePreviewToken({ action, payload, exp });
  return {
    preview: { action, payload },
    commitToken: token,
    expiresAt: new Date(exp).toISOString()
  };
};

export const registerTrelloRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    "/v1/trello/boards",
    {
      schema: {
        description: "List Trello boards accessible to the token",
        tags: ["trello"],
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                desc: { type: "string" },
                url: { type: "string" },
                closed: { type: "boolean" }
              },
              required: ["id", "name", "desc", "url", "closed"]
            }
          }
        }
      }
    },
    async () => listBoards()
  );

  fastify.get(
    "/v1/trello/boards/:boardId",
    {
      schema: {
        description: "Get Trello board details",
        tags: ["trello"],
        params: {
          type: "object",
          properties: {
            boardId: { type: "string" }
          },
          required: ["boardId"]
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              desc: { type: "string" },
              url: { type: "string" },
              closed: { type: "boolean" }
            },
            required: ["id", "name", "desc", "url", "closed"]
          }
        }
      }
    },
    async (request) => {
      const { boardId } = boardIdSchema.parse(request.params);
      return getBoard(boardId);
    }
  );

  fastify.get(
    "/v1/trello/boards/:boardId/lists",
    {
      schema: {
        description: "List Trello lists for a board",
        tags: ["trello"],
        params: {
          type: "object",
          properties: {
            boardId: { type: "string" }
          },
          required: ["boardId"]
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                closed: { type: "boolean" }
              },
              required: ["id", "name", "closed"]
            }
          }
        }
      }
    },
    async (request) => {
      const { boardId } = boardIdSchema.parse(request.params);
      if (
        config.trello.allowedBoardIds.length > 0 &&
        !config.trello.allowedBoardIds.includes(boardId)
      ) {
        throw new AppError("FORBIDDEN", "Board access is not allowed", 403);
      }

      return listLists(boardId);
    }
  );

  fastify.get(
    "/v1/trello/boards/:boardId/cards",
    {
      schema: {
        description: "List Trello cards for a board",
        tags: ["trello"],
        params: {
          type: "object",
          properties: {
            boardId: { type: "string" }
          },
          required: ["boardId"]
        },
        response: {
          200: {
            type: "array",
            items: cardResponseSchema
          }
        }
      }
    },
    async (request) => {
      const { boardId } = boardIdSchema.parse(request.params);
      return listCardsForBoard(boardId);
    }
  );

  fastify.get(
    "/v1/trello/lists/:listId/cards",
    {
      schema: {
        description: "List Trello cards for a list",
        tags: ["trello"],
        params: {
          type: "object",
          properties: {
            listId: { type: "string" }
          },
          required: ["listId"]
        },
        response: {
          200: {
            type: "array",
            items: cardResponseSchema
          }
        }
      }
    },
    async (request) => {
      const { listId } = listIdSchema.parse(request.params);
      return listCardsForList(listId);
    }
  );

  fastify.get(
    "/v1/trello/cards/:cardId",
    {
      schema: {
        description: "Get Trello card details",
        tags: ["trello"],
        params: {
          type: "object",
          properties: {
            cardId: { type: "string" }
          },
          required: ["cardId"]
        },
        response: {
          200: cardResponseSchema
        }
      }
    },
    async (request) => {
      const { cardId } = cardIdSchema.parse(request.params);
      return getCard(cardId);
    }
  );

  fastify.post(
    "/v1/trello/write/preview",
    {
      schema: {
        description: "Preview Trello write operations",
        tags: ["trello"],
        body: {
          type: "object",
          properties: {
            action: { type: "string" },
            payload: { type: "object" }
          },
          required: ["action", "payload"]
        },
        response: {
          200: {
            type: "object",
            properties: {
              preview: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  payload: { type: "object", additionalProperties: true }
                },
                required: ["action", "payload"]
              },
              commitToken: { type: "string" },
              expiresAt: { type: "string" }
            },
            required: ["preview", "commitToken", "expiresAt"]
          }
        }
      }
    },
    async (request) => {
      requireWriteToken(request);
      const { action, payload } = previewRequestSchema.parse(request.body);

      if (action === "createCard") {
        const parsed = createCardPayloadSchema.parse(payload);
        const listInfo = await getListInfo(parsed.listId);
        ensureBoardAllowed(listInfo.idBoard);
        return toPreviewResponse(action, parsed);
      }

      if (action === "createList") {
        const parsed = createListPayloadSchema.parse(payload);
        await getBoard(parsed.boardId);
        return toPreviewResponse(action, parsed);
      }

      if (action === "createLabel") {
        const parsed = createLabelPayloadSchema.parse(payload);
        await getBoard(parsed.boardId);
        return toPreviewResponse(action, parsed);
      }

      if (action === "updateList") {
        const parsed = updateListPayloadSchema.parse(payload);
        const listInfo = await getListInfo(parsed.listId);
        ensureBoardAllowed(listInfo.idBoard);
        return toPreviewResponse(action, parsed);
      }

      if (action === "updateBoard") {
        const parsed = updateBoardPayloadSchema.parse(payload);
        await getBoard(parsed.boardId);
        return toPreviewResponse(action, parsed);
      }

      if (action === "addComment") {
        const parsed = addCommentPayloadSchema.parse(payload);
        await getCard(parsed.cardId);
        return toPreviewResponse(action, parsed);
      }

      if (action === "batch") {
        const parsed = batchPayloadSchema.parse(payload);
        const operations = parsed.operations.map((operation) =>
          parseOperation(operation.action, operation.payload)
        );
        for (const operation of operations) {
          if (operation.action === "createCard") {
            const listInfo = await getListInfo(operation.payload.listId);
            ensureBoardAllowed(listInfo.idBoard);
          } else if (operation.action === "createLabel") {
            await getBoard(operation.payload.boardId);
          } else if (operation.action === "createList") {
            await getBoard(operation.payload.boardId);
          } else if (operation.action === "updateList") {
            const listInfo = await getListInfo(operation.payload.listId);
            ensureBoardAllowed(listInfo.idBoard);
          } else if (operation.action === "updateBoard") {
            await getBoard(operation.payload.boardId);
          } else if (operation.action === "addComment") {
            await getCard(operation.payload.cardId);
          } else {
            await getCard(operation.payload.cardId);
            if (operation.payload.listId) {
              const listInfo = await getListInfo(operation.payload.listId);
              ensureBoardAllowed(listInfo.idBoard);
            }
          }
        }
        return toPreviewResponse(action, { operations });
      }

      const parsed = updateCardPayloadSchema.parse(payload);
      await getCard(parsed.cardId);
      if (parsed.listId) {
        const listInfo = await getListInfo(parsed.listId);
        ensureBoardAllowed(listInfo.idBoard);
      }
      return toPreviewResponse(action, parsed);
    }
  );

  fastify.post(
    "/v1/trello/write/commit",
    {
      schema: {
        description: "Commit Trello write operations",
        tags: ["trello"],
        body: {
          type: "object",
          properties: {
            commitToken: { type: "string" }
          },
          required: ["commitToken"]
        }
      }
    },
    async (request) => {
      requireWriteToken(request);
      const { commitToken } = commitRequestSchema.parse(request.body);
      const tokenPayload = verifyPreviewToken(commitToken);

      if (tokenPayload.action === "createCard") {
        const parsed = createCardPayloadSchema.parse(tokenPayload.payload);
        const listInfo = await getListInfo(parsed.listId);
        ensureBoardAllowed(listInfo.idBoard);
        const result = await createCard(parsed);
        return { action: tokenPayload.action, result };
      }

      if (tokenPayload.action === "createList") {
        const parsed = createListPayloadSchema.parse(tokenPayload.payload);
        await getBoard(parsed.boardId);
        const result = await createList(parsed);
        return { action: tokenPayload.action, result };
      }

      if (tokenPayload.action === "createLabel") {
        const parsed = createLabelPayloadSchema.parse(tokenPayload.payload);
        await getBoard(parsed.boardId);
        const result = await createLabel(parsed);
        return { action: tokenPayload.action, result };
      }

      if (tokenPayload.action === "updateList") {
        const parsed = updateListPayloadSchema.parse(tokenPayload.payload);
        const result = await updateList(parsed);
        return { action: tokenPayload.action, result };
      }

      if (tokenPayload.action === "updateBoard") {
        const parsed = updateBoardPayloadSchema.parse(tokenPayload.payload);
        await getBoard(parsed.boardId);
        const result = await updateBoard(parsed);
        return { action: tokenPayload.action, result };
      }

      if (tokenPayload.action === "addComment") {
        const parsed = addCommentPayloadSchema.parse(tokenPayload.payload);
        await getCard(parsed.cardId);
        const result = await addComment(parsed);
        return { action: tokenPayload.action, result };
      }

      if (tokenPayload.action === "batch") {
        const parsed = batchPayloadSchema.parse(tokenPayload.payload);
        const operations = parsed.operations.map((operation) =>
          parseOperation(operation.action, operation.payload)
        );

        for (const operation of operations) {
          if (operation.action === "createCard") {
            const listInfo = await getListInfo(operation.payload.listId);
            ensureBoardAllowed(listInfo.idBoard);
          } else if (operation.action === "createLabel") {
            await getBoard(operation.payload.boardId);
          } else if (operation.action === "createList") {
            await getBoard(operation.payload.boardId);
          } else if (operation.action === "updateList") {
            const listInfo = await getListInfo(operation.payload.listId);
            ensureBoardAllowed(listInfo.idBoard);
          } else if (operation.action === "updateBoard") {
            await getBoard(operation.payload.boardId);
          } else if (operation.action === "addComment") {
            await getCard(operation.payload.cardId);
          } else {
            await getCard(operation.payload.cardId);
            if (operation.payload.listId) {
              const listInfo = await getListInfo(operation.payload.listId);
              ensureBoardAllowed(listInfo.idBoard);
            }
          }
        }

        const results: Array<{ index: number; action: WriteOperation["action"]; result: unknown }> =
          [];
        for (const [index, operation] of operations.entries()) {
          if (operation.action === "createCard") {
            const result = await createCard(operation.payload);
            results.push({ index, action: operation.action, result });
          } else if (operation.action === "createLabel") {
            const result = await createLabel(operation.payload);
            results.push({ index, action: operation.action, result });
          } else if (operation.action === "createList") {
            const result = await createList(operation.payload);
            results.push({ index, action: operation.action, result });
          } else if (operation.action === "updateList") {
            const result = await updateList(operation.payload);
            results.push({ index, action: operation.action, result });
          } else if (operation.action === "updateBoard") {
            const result = await updateBoard(operation.payload);
            results.push({ index, action: operation.action, result });
          } else if (operation.action === "addComment") {
            const result = await addComment(operation.payload);
            results.push({ index, action: operation.action, result });
          } else {
            const result = await updateCard(operation.payload);
            results.push({ index, action: operation.action, result });
          }
        }

        return { action: tokenPayload.action, results };
      }

      const parsed = updateCardPayloadSchema.parse(tokenPayload.payload);
      await getCard(parsed.cardId);
      if (parsed.listId) {
        const listInfo = await getListInfo(parsed.listId);
        ensureBoardAllowed(listInfo.idBoard);
      }
      const result = await updateCard(parsed);
      return { action: tokenPayload.action, result };
    }
  );
};
