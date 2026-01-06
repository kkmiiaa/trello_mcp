import { AppError } from "../errors.js";
import { config } from "../config.js";

type TrelloErrorPayload = {
  message?: string;
};

const buildUrl = (path: string, params: Record<string, string>) => {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const baseUrl = config.trello.baseUrl.endsWith("/")
    ? config.trello.baseUrl
    : `${config.trello.baseUrl}/`;
  const url = new URL(normalizedPath, baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  url.searchParams.set("key", config.trello.apiKey);
  url.searchParams.set("token", config.trello.apiToken);
  return url;
};

const requestTrello = async <T>(path: string, params: Record<string, string>): Promise<T> => {
  const url = buildUrl(path, params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.trello.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as TrelloErrorPayload;
      if (response.status === 401) {
        throw new AppError("TRELLO_UNAUTHORIZED", "Trello authentication failed", 401);
      }
      if (response.status === 429) {
        throw new AppError("TRELLO_RATE_LIMIT", "Trello rate limit exceeded", 429);
      }

      const status = response.status >= 500 ? 502 : response.status;
      throw new AppError("TRELLO_ERROR", payload.message ?? "Trello API error", status, {
        trelloStatus: response.status
      });
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("TRELLO_ERROR", "Trello request timed out", 504);
    }

    throw new AppError("TRELLO_ERROR", "Failed to reach Trello", 502);
  } finally {
    clearTimeout(timeout);
  }
};

export type TrelloBoard = {
  id: string;
  name: string;
  url: string;
  closed: boolean;
};

export type TrelloList = {
  id: string;
  name: string;
  closed: boolean;
};

export const listBoards = async (): Promise<TrelloBoard[]> => {
  const boards = await requestTrello<TrelloBoard[]>("/members/me/boards", {
    fields: "id,name,url,closed"
  });

  if (config.trello.allowedBoardIds.length === 0) {
    return boards;
  }

  const allowed = new Set(config.trello.allowedBoardIds);
  return boards.filter((board) => allowed.has(board.id));
};

export const listLists = async (boardId: string): Promise<TrelloList[]> =>
  requestTrello<TrelloList[]>(`/boards/${boardId}/lists`, {
    fields: "id,name,closed"
  });
