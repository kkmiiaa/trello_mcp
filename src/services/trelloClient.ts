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
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("key", config.trello.apiKey);
  url.searchParams.set("token", config.trello.apiToken);
  return url;
};

const requestTrello = async <T>(
  path: string,
  params: Record<string, string>,
  method: "GET" | "POST" | "PUT" = "GET"
): Promise<T> => {
  const url = buildUrl(path, method === "GET" ? params : {});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.trello.timeoutMs);

  try {
    const body = method === "GET" ? undefined : new URLSearchParams(params).toString();
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
      },
      body
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
  desc: string;
  url: string;
  closed: boolean;
};

export type TrelloList = {
  id: string;
  name: string;
  closed: boolean;
};

export type TrelloCard = {
  id: string;
  name: string;
  desc: string;
  url: string;
  idList: string;
  idBoard: string;
  due: string | null;
  dueComplete: boolean;
  closed: boolean;
  labels: Array<{ id: string; name: string; color: string | null }>;
};

type TrelloListInfo = {
  id: string;
  idBoard: string;
};

export const ensureBoardAllowed = (boardId: string) => {
  if (config.trello.allowedBoardIds.length === 0) {
    return;
  }
  if (!config.trello.allowedBoardIds.includes(boardId)) {
    throw new AppError("FORBIDDEN", "Board access is not allowed", 403);
  }
};

export const listBoards = async (): Promise<TrelloBoard[]> => {
  const boards = await requestTrello<TrelloBoard[]>("/members/me/boards", {
    fields: "id,name,desc,url,closed"
  });

  if (config.trello.allowedBoardIds.length === 0) {
    return boards;
  }

  const allowed = new Set(config.trello.allowedBoardIds);
  return boards.filter((board) => allowed.has(board.id));
};

export const getBoard = async (boardId: string): Promise<TrelloBoard> => {
  ensureBoardAllowed(boardId);
  return requestTrello<TrelloBoard>(`/boards/${boardId}`, {
    fields: "id,name,desc,url,closed"
  });
};

export const listLists = async (boardId: string): Promise<TrelloList[]> =>
  requestTrello<TrelloList[]>(`/boards/${boardId}/lists`, {
    fields: "id,name,closed"
  });

export const listCardsForBoard = async (boardId: string): Promise<TrelloCard[]> => {
  ensureBoardAllowed(boardId);
  return requestTrello<TrelloCard[]>(`/boards/${boardId}/cards`, {
    fields: "id,name,desc,url,idList,idBoard,due,dueComplete,closed,labels"
  });
};

export const getListInfo = async (listId: string): Promise<TrelloListInfo> =>
  requestTrello<TrelloListInfo>(`/lists/${listId}`, {
    fields: "id,idBoard"
  });

export const listCardsForList = async (listId: string): Promise<TrelloCard[]> => {
  const listInfo = await getListInfo(listId);
  ensureBoardAllowed(listInfo.idBoard);
  return requestTrello<TrelloCard[]>(`/lists/${listId}/cards`, {
    fields: "id,name,desc,url,idList,idBoard,due,dueComplete,closed,labels"
  });
};

export const getCard = async (cardId: string): Promise<TrelloCard> => {
  const card = await requestTrello<TrelloCard>(`/cards/${cardId}`, {
    fields: "id,name,desc,url,idList,idBoard,due,dueComplete,closed,labels"
  });
  ensureBoardAllowed(card.idBoard);
  return card;
};

export const createCard = async (params: {
  listId: string;
  name: string;
  desc?: string;
  due?: string | null;
  dueComplete?: boolean;
  labelIds?: string[];
}): Promise<TrelloCard> => {
  const payload: Record<string, string> = {
    idList: params.listId,
    name: params.name
  };
  if (params.desc !== undefined) payload.desc = params.desc;
  if (params.due !== undefined) payload.due = params.due ?? "";
  if (params.dueComplete !== undefined) payload.dueComplete = String(params.dueComplete);
  if (params.labelIds && params.labelIds.length > 0) {
    payload.idLabels = params.labelIds.join(",");
  }
  return requestTrello<TrelloCard>("/cards", payload, "POST");
};

export type TrelloComment = {
  id: string;
  cardId: string;
  text: string;
};

type TrelloCommentResponse = {
  id: string;
  data?: {
    card?: { id?: string };
    text?: string;
  };
};

export const addComment = async (params: {
  cardId: string;
  text: string;
}): Promise<TrelloComment> => {
  const response = await requestTrello<TrelloCommentResponse>(
    `/cards/${params.cardId}/actions/comments`,
    { text: params.text },
    "POST"
  );
  return {
    id: response.id,
    cardId: response.data?.card?.id ?? params.cardId,
    text: response.data?.text ?? params.text
  };
};

export const updateCard = async (params: {
  cardId: string;
  name?: string;
  desc?: string;
  due?: string | null;
  dueComplete?: boolean;
  closed?: boolean;
  listId?: string;
  labelIds?: string[];
}): Promise<TrelloCard> => {
  const payload: Record<string, string> = {};
  if (params.name !== undefined) payload.name = params.name;
  if (params.desc !== undefined) payload.desc = params.desc;
  if (params.due !== undefined) payload.due = params.due ?? "";
  if (params.dueComplete !== undefined) payload.dueComplete = String(params.dueComplete);
  if (params.closed !== undefined) payload.closed = String(params.closed);
  if (params.listId !== undefined) payload.idList = params.listId;
  if (params.labelIds !== undefined) payload.idLabels = params.labelIds.join(",");
  return requestTrello<TrelloCard>(`/cards/${params.cardId}`, payload, "PUT");
};
