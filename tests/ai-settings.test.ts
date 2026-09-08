import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/lib/database.ts";
import { createAISettingsRepository } from "../src/repositories/ai-settings.ts";
import {
  getAISettingsStatus,
  resetAISettings,
  saveAISettings,
} from "../src/services/ai/configuration.ts";
import { GET, PUT, DELETE } from "../src/app/api/settings/ai/route.ts";
import { POST } from "../src/app/api/settings/ai/test/route.ts";

process.env.DATABASE_PATH = ":memory:";

function request(
  method: string,
  body?: unknown,
  origin = "http://localhost:3000",
) {
  return new Request("http://localhost:3000/api/settings/ai", {
    method,
    headers: {
      host: "localhost:3000",
      origin,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("配置持久化、空白密钥保留和恢复不影响家庭资料", () => {
  const directory = mkdtempSync(join(tmpdir(), "qijia-settings-test-"));
  const path = join(directory, "test.sqlite");
  let db = openDatabase(path);
  try {
    const repo = createAISettingsRepository(db);
    repo.save({ apiKey: "fake-test-secret", model: "gpt-4.1-mini" });
    repo.save({ apiKey: "", model: "another-model" });
    db.close();
    db = openDatabase(path);
    assert.deepEqual(
      { ...createAISettingsRepository(db).read() },
      { apiKey: "fake-test-secret", model: "another-model" },
    );
    db.prepare(
      "INSERT INTO family_members (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run("fictional", "虚构测试成员", "2026-01-01", "2026-01-01");
    createAISettingsRepository(db).reset();
    assert.equal(createAISettingsRepository(db).read(), undefined);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM family_members").get()?.count,
      1,
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("配置接口仅返回状态；环境回退、输入校验和跨来源保护", async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  t.after(() => {
    resetAISettings();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
  });
  process.env.OPENAI_API_KEY = "fake-environment-secret";
  process.env.OPENAI_MODEL = "environment-model";
  resetAISettings();
  assert.deepEqual(getAISettingsStatus(), {
    configured: true,
    model: "environment-model",
    keySource: "environment",
    hasSavedSettings: false,
  });
  let response = await PUT(
    request("PUT", { apiKey: "", model: "saved-model" }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).keySource, "environment");
  response = await PUT(
    request("PUT", { apiKey: "fake-page-secret", model: "saved-model" }),
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    configured: true,
    model: "saved-model",
    keySource: "saved",
    hasSavedSettings: true,
  });
  assert.deepEqual(await GET().json(), getAISettingsStatus());
  response = await PUT(request("PUT", { apiKey: "", model: "updated-model" }));
  assert.equal((await response.json()).keySource, "saved");
  for (const input of [
    { model: "" },
    { apiKey: "invalid\nkey", model: "valid" },
    { model: "bad model" },
    { apiKey: 12, model: "valid" },
    { model: "valid", extra: "forbidden" },
  ]) {
    assert.equal((await PUT(request("PUT", input))).status, 400);
  }
  assert.equal(
    (await PUT(request("PUT", { model: "valid" }, "https://other.example")))
      .status,
    403,
  );
  assert.equal(
    DELETE(request("DELETE", undefined, "https://other.example")).status,
    403,
  );
  assert.equal(
    (await POST(request("POST", undefined, "https://other.example"))).status,
    403,
  );
  assert.equal(getAISettingsStatus().model, "updated-model");
  const resetResponse = DELETE(request("DELETE"));
  assert.equal(resetResponse.status, 200);
  assert.equal((await resetResponse.json()).keySource, "environment");
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  assert.deepEqual(getAISettingsStatus(), {
    configured: false,
    model: "gpt-4.1-mini",
    keySource: "none",
    hasSavedSettings: false,
  });
});

test("连接测试使用已保存配置与固定文字；校验输出并隐藏上游密钥错误", async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  resetAISettings();
  let kind: "ok" | "invalid" | "unauthorized" = "ok";
  let calls = 0;
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      calls++;
      assert.equal(
        new Headers(init.headers).get("authorization"),
        "Bearer fake-page-secret",
      );
      const body = JSON.parse(String(init.body));
      assert.equal(body.model, "saved-model");
      assert.deepEqual(body.input, [
        { role: "user", content: "Connection test." },
      ]);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      if (kind === "unauthorized")
        return Response.json(
          { error: { message: "Do not expose fake-page-secret" } },
          { status: 401 },
        );
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
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ message: kind === "ok" ? "ok" : "bad" }),
                annotations: [],
              },
            ],
          },
        ],
      });
    },
  );
  t.after(() => {
    fetchMock.mock.restore();
    resetAISettings();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  assert.equal((await POST(request("POST"))).status, 503);
  assert.equal(calls, 0);
  saveAISettings({ apiKey: "fake-page-secret", model: "saved-model" });
  assert.equal(calls, 0, "保存配置不会调用 AI");
  let response = await POST(request("POST"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match((await response.json()).message, /连接成功/);
  kind = "invalid";
  response = await POST(request("POST"));
  assert.equal((await response.json()).error.code, "AI_INVALID_OUTPUT");
  kind = "unauthorized";
  response = await POST(request("POST"));
  assert.equal(response.status, 503);
  const error = await response.json();
  assert.equal(error.error.code, "AI_AUTH_ERROR");
  assert.ok(!JSON.stringify(error).includes("fake-page-secret"));
  assert.equal(calls, 3);
  assert.equal(getAISettingsStatus().keySource, "saved");
});
