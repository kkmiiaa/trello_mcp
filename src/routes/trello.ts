import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import { listBoards, listLists } from "../services/trelloClient.js";

const boardIdSchema = z.object({
  boardId: z.string().min(1)
});

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
};
