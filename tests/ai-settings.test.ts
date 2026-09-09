import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  aiBaseURLSchema,
  DEFAULT_AI_BASE_URL,
} from "../src/schemas/ai-settings.ts";
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
delete process.env.OPENAI_BASE_URL;

const defaultAddressStatus = {
  baseURL: DEFAULT_AI_BASE_URL,
  baseURLSource: "default",
  savedBaseURL: "",
  baseURLError: null,
};

test("旧配置表升级后保留密钥和模型，重复启动不重复迁移", () => {
  const directory = mkdtempSync(join(tmpdir(), "qijia-settings-upgrade-"));
  const path = join(directory, "legacy.sqlite");
  let db = new DatabaseSync(path);
  try {
    db.exec(
      "CREATE TABLE ai_settings (id INTEGER PRIMARY KEY CHECK (id = 1), api_key TEXT NOT NULL DEFAULT '', model TEXT NOT NULL)",
    );
    db.prepare("INSERT INTO ai_settings VALUES (1, ?, ?)").run(
      "fake-legacy-key",
      "legacy-model",
    );
    db.close();
    db = openDatabase(path);
    assert.deepEqual(
      { ...createAISettingsRepository(db).read() },
      { apiKey: "fake-legacy-key", model: "legacy-model", baseURL: "" },
    );
    db.close();
    db = openDatabase(path);
    assert.equal(
      db
        .prepare("PRAGMA table_info(ai_settings)")
        .all()
        .filter((column) => column.name === "base_url").length,
      1,
    );
    assert.equal(
      createAISettingsRepository(db).read()?.apiKey,
      "fake-legacy-key",
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("地址校验允许本地服务和路径前缀，拒绝无效地址、凭据与具体接口路径", () => {
  for (const [input, expected] of [
    [
      " https://gateway.example/proxy/v1/// ",
      "https://gateway.example/proxy/v1",
    ],
    ["http://127.0.0.1:8080/v1", "http://127.0.0.1:8080/v1"],
    ["http://[::1]:8080/v1", "http://[::1]:8080/v1"],
    ["https://gateway.example", "https://gateway.example"],
    ["   ", ""],
  ])
    assert.equal(aiBaseURLSchema.parse(input), expected);
  for (const input of [
    "invalid",
    "/v1",
    "//gateway.example/v1",
    "ftp://gateway.example/v1",
    "javascript:alert(1)",
    "https://user:password@gateway.example/v1",
    "https://gateway.example/v1?key=secret",
    "https://gateway.example/v1#secret",
    "https://gateway.example/v1/responses",
    "https://gateway.example/v1/chat/completions/",
    "https://gateway.example/bad path",
    "https://gateway.example/\\other",
  ]) {
    assert.equal(aiBaseURLSchema.safeParse(input).success, false, input);
  }
});

test("地址优先级、清空与省略语义、无效输入不覆盖配置，错误环境可从页面修复", async (t) => {
  resetAISettings();
  const network = mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected network");
  });
  t.after(() => {
    resetAISettings();
    delete process.env.OPENAI_BASE_URL;
    network.mock.restore();
  });
  process.env.OPENAI_BASE_URL = "https://environment.example/v1/";
  assert.equal(getAISettingsStatus().baseURL, "https://environment.example/v1");
  assert.equal(getAISettingsStatus().baseURLSource, "environment");
  let response = await PUT(
    request("PUT", {
      apiKey: "fake-key",
      model: "vendor/model",
      baseURL: "https://saved.example/prefix/v1/",
    }),
  );
  assert.equal(response.status, 200);
  let status = await response.json();
  assert.equal(status.baseURL, "https://saved.example/prefix/v1");
  assert.equal(status.baseURLSource, "saved");
  await PUT(request("PUT", { model: "vendor/another-model" }));
  assert.equal(
    getAISettingsStatus().baseURL,
    status.baseURL,
    "省略地址保留原值",
  );
  response = await PUT(
    request("PUT", {
      model: "bad-overwrite",
      baseURL: "https://user:fake-secret@bad.example/v1",
    }),
  );
  assert.equal(response.status, 400);
  assert.ok(!(await response.text()).includes("fake-secret"));
  assert.equal(getAISettingsStatus().model, "vendor/another-model");
  await PUT(request("PUT", { model: "vendor/model", baseURL: "" }));
  assert.equal(
    getAISettingsStatus().baseURLSource,
    "environment",
    "空白清除地址覆盖值",
  );
  assert.equal(getAISettingsStatus().keySource, "saved", "清空地址保留密钥");
  await PUT(
    request("PUT", { model: "vendor/model", baseURL: DEFAULT_AI_BASE_URL }),
  );
  assert.equal(
    getAISettingsStatus().baseURL,
    DEFAULT_AI_BASE_URL,
    "显式官方地址覆盖环境变量",
  );
  DELETE(request("DELETE"));
  assert.equal(getAISettingsStatus().baseURLSource, "environment");
  process.env.OPENAI_BASE_URL =
    "https://user:fake-environment-secret@bad.example/v1";
  response = GET();
  assert.equal(response.status, 200, "错误环境变量不阻断设置修复");
  status = await response.json();
  assert.equal(status.baseURL, "");
  assert.ok(status.baseURLError);
  assert.ok(!JSON.stringify(status).includes("fake-environment-secret"));
  response = await POST(request("POST"));
  assert.equal((await response.json()).error.code, "AI_INVALID_BASE_URL");
  await PUT(
    request("PUT", { model: "vendor/model", baseURL: DEFAULT_AI_BASE_URL }),
  );
  assert.equal(getAISettingsStatus().baseURLError, null);
  assert.equal(network.mock.callCount(), 0);
});

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
    repo.save({
      apiKey: "fake-test-secret",
      model: "gpt-4.1-mini",
      baseURL: "https://saved.example/v1",
    });
    repo.save({ apiKey: "", model: "another-model" });
    db.close();
    db = openDatabase(path);
    assert.deepEqual(
      { ...createAISettingsRepository(db).read() },
      {
        apiKey: "fake-test-secret",
        model: "another-model",
        baseURL: "https://saved.example/v1",
      },
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
    ...defaultAddressStatus,
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
    ...defaultAddressStatus,
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
    ...defaultAddressStatus,
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
      assert.equal(String(_url), "https://gateway.example/custom/v1/responses");
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
  saveAISettings({
    apiKey: "fake-page-secret",
    model: "saved-model",
    baseURL: "https://gateway.example/custom/v1/",
  });
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
