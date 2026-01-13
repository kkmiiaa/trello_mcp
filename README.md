# Trello Actions Proxy

ChatGPT Actions から利用できる Trello 操作用プロキシ API です。まずは read-only の疎通確認用エンドポイントのみを提供し、将来の write 操作追加に備えた構成にしています。

## 主要機能

- `GET /v1/ping`
- `GET /v1/trello/boards`
- `GET /v1/trello/boards/:boardId`
- `GET /v1/trello/boards/:boardId/lists`
- `GET /v1/trello/boards/:boardId/labels`
- `GET /v1/trello/boards/:boardId/cards`
- `GET /v1/trello/lists/:listId/cards`
- `GET /v1/trello/cards/:cardId`
- `POST /v1/trello/write/commit`

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

## Cloud Run へのデプロイ（GitHub Actions）

このリポジトリは GHA で Cloud Run へデプロイできるようにしています。事前に以下を準備してください。

1. GCP 側で Workload Identity Federation を作成
2. Artifact Registry の Docker リポジトリを作成
3. GitHub Secrets を設定
4. Cloud Run / Cloud Build / Artifact Registry の API を有効化

Artifact Registry の作成例:

```bash
gcloud artifacts repositories create trello-actions \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Trello Actions Proxy images"
```

Cloud Build のログ保存用バケット例:

```bash
gsutil mb -l asia-northeast1 gs://YOUR_LOGS_BUCKET
```

必須 Secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: Workload Identity Provider のフルリソース名
- `GCP_SERVICE_ACCOUNT`: デプロイ用サービスアカウントのメールアドレス
- `GCP_PROJECT_ID`: GCP プロジェクト ID
- `GCP_ARTIFACT_REPOSITORY`: Artifact Registry のリポジトリ名
- `GCP_BUILD_SERVICE_ACCOUNT`: Cloud Build で使うサービスアカウントのメールアドレス
- `GCP_CLOUD_BUILD_LOGS_BUCKET`: Cloud Build のログ保存用 GCS バケット名
- `TRELLO_API_KEY`
- `TRELLO_API_TOKEN`

任意 Secrets:

- `TRELLO_ALLOWED_BOARD_IDS`: allowlist 用
- `INTERNAL_TOKEN`: `X-Internal-Token` で保護したい場合

デプロイは `main` ブランチへの push で自動実行されます。`SERVICE_NAME` と `REGION` は `.github/workflows/ci.yml` の `deploy` ジョブで調整できます。

デプロイ完了後に表示される URL を `actions/openapi.yaml` の `serverUrl` に設定してください。

Cloud Run は `allow_unauthenticated: true` で公開されるため、必要に応じて `INTERNAL_TOKEN` を設定してください。

## 疎通確認

```bash
curl http://localhost:3000/v1/ping
curl http://localhost:3000/v1/trello/boards
curl http://localhost:3000/v1/trello/boards/{boardId}
curl http://localhost:3000/v1/trello/boards/{boardId}/lists
```

`INTERNAL_TOKEN` を設定している場合はヘッダに `X-Internal-Token` を付与してください。

## write 操作のコミット

write 操作は `X-Internal-Token` が必須です。
`action` は `createCard` / `addComment` / `updateCard` / `createLabel` / `createList` / `updateList` / `updateBoard` / `batch` を利用できます。
`createCard` では `urlSource` を指定するとリンクカードを作成できます。

```bash
curl -X POST http://localhost:3000/v1/trello/write/commit \\
  -H "Content-Type: application/json" \\
  -H "X-Internal-Token: YOUR_TOKEN" \\
  -d '{\"action\":\"createCard\",\"payload\":{\"listId\":\"LIST_ID\",\"name\":\"Task\"}}'
```

`updateCard` / `updateList` の `closed` はアーカイブ（`true`）のみ許可されます。

## バッチ書き込み

複数操作をまとめて実行できます。`action: "batch"` で `operations` を渡してください。
実行中の失敗で一部完了する可能性があります。

```bash
curl -X POST http://localhost:3000/v1/trello/write/commit \\
  -H "Content-Type: application/json" \\
  -H "X-Internal-Token: YOUR_TOKEN" \\
  -d '{\"action\":\"batch\",\"payload\":{\"operations\":[{\"action\":\"createCard\",\"payload\":{\"listId\":\"LIST_ID\",\"name\":\"Task 1\"}},{\"action\":\"addComment\",\"payload\":{\"cardId\":\"CARD_ID\",\"text\":\"Note\"}}]}}'
```

## セキュリティ方針（概要）

- Trello の API Key / Token はサーバ側で保持し、レスポンスやログに出しません。
- allowlist による board ID 制限を read-only エンドポイントにも適用します。
- レート制限や認証失敗は専用のエラーコードで返します。
- write 操作は `X-Internal-Token` を必須にします。
