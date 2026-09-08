import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/lib/database.ts";
import { createDocumentRepository } from "../src/repositories/documents.ts";
import { documentSchema, organizationSchema } from "../src/schemas/document.ts";
import { AppError, errorResponse, readJson } from "../src/lib/api.ts";
import { organizeDocument } from "../src/services/ai/organize-document.ts";

test("资料保存到磁盘后可重新打开，编辑保留创建时间，删除准确返回结果", () => {
  const directory = mkdtempSync(join(tmpdir(), "family-library-test-"));
  const path = join(directory, "test.sqlite");
  let db = openDatabase(path);
  try {
    let repo = createDocumentRepository(db);
    const input = documentSchema.parse({
      title: " 净水器滤芯 ",
      content: "厨房净水器使用 ABC-100 型滤芯。",
      category: "物品资料",
      tags: ["厨房", "厨房"],
    });
    const created = repo.create(input);
    assert.deepEqual(created.tags, ["厨房"]);
    db.close();
    db = openDatabase(path);
    repo = createDocumentRepository(db);
    assert.deepEqual(repo.find(created.id), created);
    const updated = repo.update(created.id, {
      ...input,
      title: "厨房净水器资料",
      summary: "型号 ABC-100",
    });
    assert.equal(updated?.createdAt, created.createdAt);
    assert.equal(updated?.content, input.content);
    assert.equal(repo.list().counts.物品资料, 1);
    assert.equal(repo.remove("missing"), false);
    assert.equal(repo.remove(created.id), true);
    assert.equal(repo.find(created.id), null);
    assert.equal(repo.update(created.id, input), null);
    assert.equal(repo.list().total, 0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("中文搜索覆盖正文、摘要、标签、来源，筛选不改变总计，特殊字符按字面处理", () => {
  const db = openDatabase(":memory:");
  const repo = createDocumentRepository(db);
  try {
    const input = documentSchema.parse({
      title: "清洗技巧",
      content: "使用白醋，比例为 5%。型号 ABC_1。",
      category: "实用知识",
      tags: ["除垢"],
      source: "家人分享",
      summary: "适用于水壶",
    });
    const doc = repo.create(input);
    repo.create({
      ...input,
      title: "周末安排",
      content: "星期六整理书架",
      category: "重要安排",
      tags: [],
      summary: "",
      source: "",
    });
    for (const query of [
      "清洗",
      "白醋",
      "除垢",
      "家人",
      "水壶",
      "5%",
      "abc_1",
      "%",
      "_",
    ]) {
      assert.deepEqual(
        repo.list(query).documents.map((item) => item.id),
        [doc.id],
      );
    }
    assert.equal(repo.list("' OR 1=1 --").documents.length, 0);
    assert.equal(repo.list("", "重要安排").documents.length, 1);
    assert.equal(repo.list("无结果").total, 2);
    assert.equal(repo.list("", "实用知识").counts.重要安排, 1);
    assert.equal("content" in repo.list().documents[0], false);
  } finally {
    db.close();
  }
});

test("schema 拒绝空正文、超长内容、错误分类和未知字段", () => {
  const input = { title: "测试", content: "原文", category: "实用知识" };
  assert.equal(
    documentSchema.safeParse({ ...input, content: "  " }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({ ...input, content: "字".repeat(20001) }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({ ...input, category: "不存在" }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({ ...input, apiKey: "not-allowed" }).success,
    false,
  );
  assert.equal(
    organizationSchema.safeParse({
      title: "标题",
      summary: "摘要",
      category: "实用知识",
      tags: [],
      content: "不应改写原文",
    }).success,
    false,
  );
  assert.equal(
    organizationSchema.safeParse({
      title: "标题",
      summary: "摘要",
      category: "实用知识",
      tags: ["过长".repeat(11)],
    }).success,
    false,
  );
});

test("JSON 请求限制来源、格式和大小；错误不会暴露内部内容", async () => {
  function request(body: string, headers: Record<string, string> = {}) {
    return new Request("http://localhost:3000/api/documents", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        "content-type": "application/json",
        ...headers,
      },
      body,
    });
  }
  assert.deepEqual(await readJson(request('{"title":"测试"}')), {
    title: "测试",
  });
  await assert.rejects(
    readJson(request("not-json")),
    (error: AppError) => error.code === "INVALID_JSON",
  );
  await assert.rejects(
    readJson(request("{}", { origin: "https://external.example" })),
    (error: AppError) => error.status === 403,
  );
  await assert.rejects(
    readJson(request("{}", { "content-type": "text/plain" })),
    (error: AppError) => error.status === 415,
  );
  await assert.rejects(
    readJson(request("x".repeat(128 * 1024 + 1))),
    (error: AppError) => error.status === 413,
  );
  const response = errorResponse(new Error("private-body-or-secret"));
  assert.equal(response.status, 500);
  assert.equal(
    (await response.text()).includes("private-body-or-secret"),
    false,
  );
});

test("缺少 AI Key 时给出明确错误，不影响资料管理，也不会调用外部服务", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      organizeDocument({ content: "这是足够长的一段家庭资料原文。" }),
      (error: AppError) => error.code === "AI_NOT_CONFIGURED",
    );
  } finally {
    if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
  }
});

test("AI 请求使用严格 JSON Schema，验证成功、拒答和无效输出，不进行真实网络调用", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-placeholder";
  const expected = {
    title: "净水器维护",
    summary: "滤芯型号 ABC-100。",
    category: "物品资料",
    tags: ["净水器"],
  };
  let kind: "success" | "refusal" | "invalid" = "success";
  let calls = 0;
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (_request: unknown, init: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init.body));
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.equal(body.input[0].content, "厨房净水器滤芯型号为 ABC-100。");
      const content =
        kind === "refusal"
          ? [{ type: "refusal", refusal: "Cannot organize" }]
          : [
              {
                type: "output_text",
                text:
                  kind === "invalid"
                    ? '{"title":42}'
                    : JSON.stringify(expected),
                annotations: [],
              },
            ];
      return Response.json({
        id: "resp_test",
        object: "response",
        created_at: 0,
        status: "completed",
        output: [
          {
            type: "message",
            id: "msg_test",
            role: "assistant",
            status: "completed",
            content,
          },
        ],
      });
    },
  );
  try {
    const input = { content: "厨房净水器滤芯型号为 ABC-100。" };
    assert.deepEqual(await organizeDocument(input), expected);
    kind = "refusal";
    await assert.rejects(
      organizeDocument(input),
      (error: AppError) => error.code === "AI_REFUSED",
    );
    kind = "invalid";
    await assert.rejects(
      organizeDocument(input),
      (error: AppError) => error.code === "AI_INVALID_OUTPUT",
    );
    assert.equal(calls, 3);
  } finally {
    fetchMock.mock.restore();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
