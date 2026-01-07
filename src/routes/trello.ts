import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import {
  getCard,
  listBoards,
  listCardsForBoard,
  listCardsForList,
  listLists
} from "../services/trelloClient.js";

const boardIdSchema = z.object({
  boardId: z.string().min(1)
});

const listIdSchema = z.object({
  listId: z.string().min(1)
});

const cardIdSchema = z.object({
  cardId: z.string().min(1)
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
};
