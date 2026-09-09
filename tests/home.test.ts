import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { getDatabase, openDatabase } from "../src/lib/database.ts";
import { addDays, dueGroup, homeToday } from "../src/lib/dates.ts";
import { createActivityRepository } from "../src/repositories/activities.ts";
import { createDocumentRepository } from "../src/repositories/documents.ts";
import {
  activityCreateSchema,
  activitySchema,
} from "../src/schemas/activity.ts";
import { documentSchema } from "../src/schemas/document.ts";
import { POST as prepare } from "../src/app/api/home/prepare/route.ts";
import { POST as confirm } from "../src/app/api/home/confirm/route.ts";
import { GET as list } from "../src/app/api/activities/route.ts";
import { PATCH, PUT, DELETE } from "../src/app/api/activities/[id]/route.ts";
import { GET as download } from "../src/app/api/activities/[id]/file/route.ts";

process.env.DATABASE_PATH = ":memory:";
process.env.OPENAI_API_KEY = "fake-home-test-key";
delete process.env.OPENAI_BASE_URL;
const todo = {
  kind: "todo" as const,
  title: "缴虚构物业费",
  notes: "账单以原文为准",
  dueOn: "2026-09-10",
  items: [],
  source: "虚构通知",
  sourceContent: "请于2026年9月10日缴费。",
};
const metadata = {
  title: "虚构物业通知",
  summary: "请按原文办理缴费。",
  category: "家庭事务",
  tags: ["缴费"],
  health: null,
  uncertainties: [],
};
const plan = {
  document: metadata,
  todos: [
    {
      title: todo.title,
      notes: todo.notes,
      dueOn: todo.dueOn,
      clarification: "",
    },
  ],
  checklists: [],
  message: "已生成资料和待办草稿，请核对后确认。",
};
function request(
  body?: unknown,
  method = "POST",
  origin = "http://localhost:3000",
) {
  return new Request("http://localhost:3000/api/home/confirm", {
    method,
    headers: {
      host: "localhost:3000",
      origin,
      ...(body instanceof FormData || body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    ...(body !== undefined
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
}
function response(result: unknown) {
  return Response.json({
    id: "resp_home",
    object: "response",
    created_at: 0,
    status: "completed",
    output: [
      {
        type: "message",
        id: "msg_home",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(result),
            annotations: [],
          },
        ],
      },
    ],
  });
}

test("日期按北京时间跨午夜、月份和年份归集，未定日期不变成今天", () => {
  assert.equal(homeToday(new Date("2026-12-31T15:59:59Z")), "2026-12-31");
  assert.equal(homeToday(new Date("2026-12-31T16:00:00Z")), "2027-01-01");
  assert.equal(addDays("2028-02-28", 2), "2028-03-01");
  assert.equal(dueGroup("", "2026-12-31"), "undated");
  assert.equal(dueGroup("2026-12-30", "2026-12-31"), "overdue");
  assert.equal(dueGroup("2026-12-31", "2026-12-31"), "today");
  assert.equal(dueGroup("2027-01-07", "2026-12-31"), "upcoming");
  assert.equal(dueGroup("2027-01-08", "2026-12-31"), "later");
});

test("事项和附件持久化；升级保留资料与配置；确认重试不重复写入", () => {
  const directory = mkdtempSync(join(tmpdir(), "qijia-home-test-"));
  const path = join(directory, "isolated.sqlite");
  let db = openDatabase(path);
  try {
    const documents = createDocumentRepository(db);
    const documentId = randomUUID();
    const document = documents.create(
      documentSchema.parse({
        title: "测试说明书",
        content: "虚构型号ABC",
        category: "物品资料",
      }),
      undefined,
      documentId,
    );
    assert.equal(
      documents.create(
        documentSchema.parse({
          title: document.title,
          content: document.content,
          category: document.category,
        }),
        undefined,
        documentId,
      ).id,
      documentId,
    );
    db.prepare(
      "INSERT INTO ai_settings (id, api_key, model, base_url) VALUES (1, '', 'fake-model', '')",
    ).run();
    const repo = createActivityRepository(db);
    const id = randomUUID();
    const file = {
      name: "虚构.txt",
      mimeType: "text/plain",
      size: 3,
      data: Buffer.from("abc"),
    };
    const saved = repo.create(activityCreateSchema.parse(todo), file, id);
    assert.deepEqual(
      repo.create({ ...todo, title: "重试不会覆盖已保存版本" }, null, id),
      saved,
    );
    db.close();
    db = openDatabase(path);
    const reopened = createActivityRepository(db);
    assert.deepEqual(reopened.find(id), saved);
    assert.deepEqual(reopened.attachment(id), file);
    assert.equal(
      createDocumentRepository(db).find(documentId)?.content,
      "虚构型号ABC",
    );
    assert.equal(
      db.prepare("SELECT model FROM ai_settings").get()?.model,
      "fake-model",
    );
    assert.equal(reopened.toggle(id, true).completed, true);
    assert.equal(reopened.toggle(id, false).completed, false);
    assert.equal(reopened.remove(id), true);
    assert.equal(reopened.attachment(id), null);
    assert.equal(createDocumentRepository(db).list().total, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("清单逐项完成、编辑保留条目状态，全部完成后可重新打开；校验拒绝空项与重复编号", () => {
  const db = openDatabase(":memory:");
  try {
    const repo = createActivityRepository(db);
    const items = ["帐篷", "饮水"].map((text) => ({
      id: randomUUID(),
      text,
      completed: false,
    }));
    const value = repo.create(
      activityCreateSchema.parse({
        ...todo,
        kind: "checklist",
        items,
        dueOn: "",
      }),
    );
    const first = repo.toggle(value.id, true, items[0].id);
    assert.equal(first.completed, false);
    const edited = repo.update(
      value.id,
      activitySchema.parse({
        kind: first.kind,
        title: "露营准备",
        notes: first.notes,
        dueOn: "",
        items: [{ ...first.items[0], text: "双人帐篷" }, first.items[1]],
      }),
    );
    assert.equal(edited.items[0].completed, true);
    assert.equal(repo.toggle(value.id, true, items[1].id).completed, true);
    assert.ok(
      repo.toggle(value.id, false).items.every((item) => !item.completed),
    );
    assert.throws(() => repo.toggle(value.id, true, randomUUID()));
    assert.equal(
      activityCreateSchema.safeParse({ ...todo, kind: "checklist", items: [] })
        .success,
      false,
    );
    assert.equal(
      activityCreateSchema.safeParse({
        ...todo,
        kind: "checklist",
        items: [items[0], items[0]],
      }).success,
      false,
    );
    assert.equal(
      activityCreateSchema.safeParse({
        ...todo,
        kind: "checklist",
        items: [{ ...items[0], text: " " }],
      }).success,
      false,
    );
    assert.equal(
      activityCreateSchema.safeParse({ ...todo, dueOn: "2026-02-30" }).success,
      false,
    );
  } finally {
    db.close();
  }
});

test("统一整理一次生成多个草稿，保留文字与文件原文，确认前不写库", async (t) => {
  const db = getDatabase();
  const before = db
    .prepare("SELECT COUNT(*) AS count FROM activities")
    .get()?.count;
  const network = mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.text.format.name, "family_home_text");
      assert.equal(body.text.format.strict, true);
      assert.equal(body.store, false);
      assert.ok(body.instructions.includes("Asia/Shanghai"));
      assert.ok(body.instructions.includes("不默认今天或自行补年份"));
      return response(plan);
    },
  );
  t.after(() => network.mock.restore());
  const original = "请于2026年9月10日缴费。\n这行保留原文。";
  const text = await prepare(request({ content: original }));
  assert.equal(text.status, 200);
  assert.equal(text.headers.get("cache-control"), "no-store");
  const result = await text.json();
  assert.equal(result.document.category, "家庭事务");
  assert.equal(result.todos.length, 1);
  assert.equal(result.content, original);
  const form = new FormData();
  form.set("file", new File([original], "虚构通知.txt"));
  const file = await (await prepare(request(form))).json();
  assert.equal(file.content, original);
  assert.equal(file.source, "虚构通知.txt");
  assert.equal(network.mock.callCount(), 2);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM activities").get()?.count,
    before,
  );
});

test("图片只调用一次 AI，缺年份日期留空；不一致健康输出和缺配置返回错误", async (t) => {
  let result: unknown = {
    document: null,
    todos: [
      {
        ...plan.todos[0],
        dueOn: "",
        clarification: "原文只有月日，请确认年份",
      },
    ],
    checklists: [],
    message: "日期待核对",
    content: "9月10日缴费",
  };
  const network = mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.text.format.name, "family_home_image");
      assert.equal(body.input[0].content[1].type, "input_image");
      return response(result);
    },
  );
  t.after(() => network.mock.restore());
  const png = await sharp({
    create: { width: 30, height: 30, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("file", new File([Uint8Array.from(png)], "虚构截图.png"));
  const reply = await prepare(request(form));
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).todos[0].dueOn, "");
  assert.equal(network.mock.callCount(), 1);
  result = {
    ...plan,
    document: { ...metadata, category: "健康档案" },
    content: "虚构报告",
  };
  assert.equal((await prepare(request(form))).status, 502);
  delete process.env.OPENAI_API_KEY;
  try {
    assert.equal((await prepare(request({ content: "缴费" }))).status, 503);
  } finally {
    process.env.OPENAI_API_KEY = "fake-home-test-key";
  }
});

test("确认、修改、勾选、下载和删除接口：附件原子保存、重复请求幂等、来源与输入校验", async () => {
  const id = randomUUID();
  const card = { id, kind: "activity", data: todo };
  const form = new FormData();
  form.set("card", JSON.stringify(card));
  form.set("file", new File(["fictional source"], "虚构来源.txt"));
  const first = await confirm(request(form));
  assert.equal(first.status, 201);
  assert.equal((await first.json()).attachment.name, "虚构来源.txt");
  assert.equal((await (await confirm(request(form))).json()).id, id);
  assert.equal(
    (await (await list()).json()).filter(
      (item: { id: string }) => item.id === id,
    ).length,
    1,
  );
  const context = { params: Promise.resolve({ id }) };
  assert.equal(
    await (await download(request(undefined, "GET"), context)).text(),
    "fictional source",
  );
  assert.equal(
    (await (await PATCH(request({ completed: true }, "PATCH"), context)).json())
      .completed,
    true,
  );
  const fields = {
    kind: todo.kind,
    title: "修改缴费安排",
    notes: todo.notes,
    dueOn: "",
    items: [],
  };
  assert.equal(
    (await (await PUT(request(fields, "PUT"), context)).json()).completed,
    true,
  );
  assert.equal(
    (await confirm(request(card, "POST", "https://other.example"))).status,
    403,
  );
  assert.equal(
    (
      await confirm(
        request({
          ...card,
          data: {
            ...todo,
            items: [
              { id: randomUUID(), text: "非法待办条目", completed: false },
            ],
          },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await PATCH(
        request({ completed: true, itemId: randomUUID() }, "PATCH"),
        context,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await DELETE(
        request(undefined, "DELETE", "https://other.example"),
        context,
      )
    ).status,
    403,
  );
  assert.equal(
    (await DELETE(request(undefined, "DELETE"), context)).status,
    204,
  );
  assert.equal(
    (await download(request(undefined, "GET"), context)).status,
    404,
  );
  assert.equal((await PUT(request(fields, "PUT"), context)).status, 404);
});

test("资料可独立确认且重试幂等，健康资料须选择真实存在的成员", async () => {
  const id = randomUUID();
  const document = {
    id,
    kind: "document",
    data: documentSchema.parse({
      title: "虚构公告",
      content: "供核对的原文",
      category: "家庭事务",
    }),
  };
  assert.equal((await confirm(request(document))).status, 201);
  assert.equal((await (await confirm(request(document))).json()).id, id);
  const health = {
    ...document,
    id: randomUUID(),
    data: {
      ...document.data,
      category: "健康档案",
      health: {
        memberId: "",
        recordType: "其他",
        occurredOn: "",
        hospital: "",
        diagnosis: "原文待排",
        medications: "",
        followUp: "",
      },
    },
  };
  assert.equal((await confirm(request(health))).status, 400);
  assert.equal(
    (
      await prepare(
        request({ content: "test" }, "POST", "https://other.example"),
      )
    ).status,
    403,
  );
});
