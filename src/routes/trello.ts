import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import {
  addComment,
  createCard,
  ensureBoardAllowed,
  getCard,
  getListInfo,
  listBoards,
  listCardsForBoard,
  listCardsForList,
  listLists,
  updateCard
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
  action: z.enum(["createCard", "addComment", "updateCard"]),
  payload: z.record(z.unknown())
});

const commitRequestSchema = z.object({
  commitToken: z.string().min(1)
});

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
                url: { type: "string" },
                closed: { type: "boolean" }
              },
              required: ["id", "name", "url", "closed"]
            }
          }
        }
      }
    },
    async () => listBoards()
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
        const parsed = z
          .object({
            listId: z.string().min(1),
            name: z.string().min(1),
            desc: z.string().optional(),
            due: z.string().nullable().optional(),
            dueComplete: z.boolean().optional(),
            labelIds: z.array(z.string()).optional()
          })
          .parse(payload);

        const listInfo = await getListInfo(parsed.listId);
        ensureBoardAllowed(listInfo.idBoard);
        return toPreviewResponse(action, parsed);
      }

      if (action === "addComment") {
        const parsed = z
          .object({
            cardId: z.string().min(1),
            text: z.string().min(1)
          })
          .parse(payload);
        await getCard(parsed.cardId);
        return toPreviewResponse(action, parsed);
      }

      const parsed = z
        .object({
          cardId: z.string().min(1),
          name: z.string().optional(),
          desc: z.string().optional(),
          due: z.string().nullable().optional(),
          dueComplete: z.boolean().optional(),
          closed: z.boolean().optional(),
          listId: z.string().optional(),
          labelIds: z.array(z.string()).optional()
        })
        .parse(payload);
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
        const parsed = z
          .object({
            listId: z.string().min(1),
            name: z.string().min(1),
            desc: z.string().optional(),
            due: z.string().nullable().optional(),
            dueComplete: z.boolean().optional(),
            labelIds: z.array(z.string()).optional()
          })
          .parse(tokenPayload.payload);
        const listInfo = await getListInfo(parsed.listId);
        ensureBoardAllowed(listInfo.idBoard);
        const result = await createCard(parsed);
        return { action: tokenPayload.action, result };
      }

      if (tokenPayload.action === "addComment") {
        const parsed = z
          .object({
            cardId: z.string().min(1),
            text: z.string().min(1)
          })
          .parse(tokenPayload.payload);
        await getCard(parsed.cardId);
        const result = await addComment(parsed);
        return { action: tokenPayload.action, result };
      }

      const parsed = z
        .object({
          cardId: z.string().min(1),
          name: z.string().optional(),
          desc: z.string().optional(),
          due: z.string().nullable().optional(),
          dueComplete: z.boolean().optional(),
          closed: z.boolean().optional(),
          listId: z.string().optional(),
          labelIds: z.array(z.string()).optional()
        })
        .parse(tokenPayload.payload);
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
