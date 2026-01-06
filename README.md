# Trello Actions Proxy

ChatGPT Actions から利用できる Trello 操作用プロキシ API です。まずは read-only の疎通確認用エンドポイントのみを提供し、将来の write 操作追加に備えた構成にしています。

## 主要機能

- `GET /v1/ping`
- `GET /v1/trello/boards`
- `GET /v1/trello/boards/:boardId/lists`

## 事前準備

1. Trello の API Key / Token を発行します。
2. `.env.example` を参考に `.env` を作成します。

```bash
cp .env.example .env
```

## ローカル起動

```bash
npm install
npm run dev
```

`http://localhost:3000/v1/ping` で疎通確認できます。

## 環境変数

- `TRELLO_API_KEY`: Trello API Key
- `TRELLO_API_TOKEN`: Trello API Token
- `TRELLO_ALLOWED_BOARD_IDS`: 許可する board ID をカンマ区切りで指定（未設定なら全ボード）
- `INTERNAL_TOKEN`: 任意の簡易ガード用トークン（`X-Internal-Token` で検証）
- `HOST` / `PORT`: バインド先
- `TRELLO_BASE_URL`: Trello API Base URL（通常は変更不要）
- `REQUEST_TIMEOUT_MS`: Trello API タイムアウト

## ChatGPT Actions への貼り付け

- `actions/openapi.yaml` を Actions の OpenAPI として使用します。
- `servers` の `serverUrl` は環境に合わせて差し替えてください。

## 疎通確認

```bash
curl http://localhost:3000/v1/ping
curl http://localhost:3000/v1/trello/boards
curl http://localhost:3000/v1/trello/boards/{boardId}/lists
```

`INTERNAL_TOKEN` を設定している場合はヘッダに `X-Internal-Token` を付与してください。

## セキュリティ方針（概要）

- Trello の API Key / Token はサーバ側で保持し、レスポンスやログに出しません。
- allowlist による board ID 制限を read-only エンドポイントにも適用します。
- レート制限や認証失敗は専用のエラーコードで返します。
