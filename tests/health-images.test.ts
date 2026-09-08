import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { AppError } from "../src/lib/api.ts";
import { openDatabase } from "../src/lib/database.ts";
import { createDocumentRepository } from "../src/repositories/documents.ts";
import { createMemberRepository } from "../src/repositories/members.ts";
import { documentSchema } from "../src/schemas/document.ts";
import {
  memberSchema,
  emptyHealthRecord,
  healthOrganizationSchema,
} from "../src/schemas/health.ts";
import { extractFile } from "../src/services/files/extract-text.ts";
import { validateFile } from "../src/services/files/validate-file.ts";
import { analyzeImage } from "../src/services/ai/analyze-image.ts";
import { organizeHealth } from "../src/services/ai/organize-health.ts";
import { runExclusiveAI } from "../src/services/ai/run-exclusive.ts";
import { readDocumentWrite } from "../src/services/files/read-upload.ts";

process.env.DATABASE_PATH = ":memory:";

async function imageFixture(format: "png" | "jpeg" | "webp" = "png") {
  return sharp({
    create: { width: 120, height: 90, channels: 3, background: "#edf3e5" },
  })
    .toFormat(format)
    .toBuffer();
}
function imageFile(data: Buffer, name = "病历.png") {
  return new File([Uint8Array.from(data)], name);
}

test("三种静态图片均可导入且不联网；拒绝伪装、损坏图片与超大像素", async () => {
  const network = mock.method(globalThis, "fetch", () => {
    throw new Error("No automatic AI request");
  });
  try {
    for (const format of ["png", "jpeg", "webp"] as const) {
      const data = await imageFixture(format);
      const file = imageFile(data, `原图.${format}`);
      const result = await extractFile(file);
      assert.equal(result.content, "");
      assert.match(result.warning!, /AI 解析图片/);
      assert.equal(result.attachment.mimeType, `image/${format}`);
      assert.deepEqual((await validateFile(file)).data, data);
    }
    const png = await imageFixture();
    await assert.rejects(
      validateFile(imageFile(png, "伪装.jpg")),
      (e: AppError) => e.code === "INVALID_IMAGE",
    );
    await assert.rejects(
      validateFile(imageFile(png.subarray(0, 40))),
      (e: AppError) => e.code === "INVALID_IMAGE",
    );
    const huge = Buffer.from(png);
    huge.writeUInt32BE(100000, 16);
    huge.writeUInt32BE(100000, 20);
    await assert.rejects(
      validateFile(imageFile(huge)),
      (e: AppError) => e.code === "INVALID_IMAGE",
    );
    const form = new FormData();
    form.set(
      "document",
      JSON.stringify({
        title: "原图",
        content: "手动病历记录",
        category: "实用知识",
      }),
    );
    form.set("file", imageFile(png, "伪装.jpg"));
    await assert.rejects(
      readDocumentWrite(
        new Request("http://localhost/api/documents", {
          method: "POST",
          body: form,
        }),
      ),
      (e: AppError) => e.code === "INVALID_IMAGE",
    );
    assert.equal(network.mock.callCount(), 0);
  } finally {
    network.mock.restore();
  }
});

test("成员、健康记录及原图跨重启保留；成员隔离、日期排序、转移与删除保护", async () => {
  const directory = mkdtempSync(join(tmpdir(), "family-health-"));
  const path = join(directory, "test.sqlite");
  let db = openDatabase(path);
  try {
    let members = createMemberRepository(db),
      docs = createDocumentRepository(db);
    const mother = members.create(
      memberSchema.parse({
        name: "妈妈",
        allergies: "青霉素",
        birthDate: "1960-02-29",
      }),
    );
    const father = members.create(memberSchema.parse({ name: "爸爸" }));
    const health = {
      ...emptyHealthRecord(mother.id),
      occurredOn: "2026-09-08",
      hospital: "社区医院",
      diagnosis: "待排，不是确诊",
      medications: "原文药物 5 mg",
    };
    const input = documentSchema.parse({
      title: "复诊病历",
      content: "医生记录内容与用药，请核对原件。",
      category: "健康档案",
      health,
    });
    const attachment = await validateFile(imageFile(await imageFixture()));
    const record = docs.create(input, attachment);
    const older = docs.create({
      ...input,
      title: "之前的病历",
      health: { ...health, occurredOn: "2025-01-02" },
    });
    docs.create({
      ...input,
      title: "爸爸的病历",
      health: { ...health, memberId: father.id },
    });
    assert.deepEqual(
      docs.list("", "健康档案", mother.id).documents.map((d) => d.id),
      [record.id, older.id],
    );
    assert.equal(docs.list("爸爸", "健康档案", mother.id).documents.length, 0);
    assert.equal(docs.list("5 mg", "健康档案", mother.id).documents.length, 2);
    assert.throws(
      () => members.remove(mother.id),
      (e: AppError) => e.code === "MEMBER_HAS_RECORDS",
    );
    const count = docs.list().total;
    assert.throws(
      () =>
        docs.create(
          { ...input, health: { ...health, memberId: randomUUID() } },
          attachment,
        ),
      (e: AppError) => e.code === "MEMBER_NOT_FOUND",
    );
    assert.equal(docs.list().total, count);
    assert.throws(
      () =>
        docs.update(
          record.id,
          {
            ...input,
            title: "不应保存",
            health: { ...health, memberId: randomUUID() },
          },
          null,
        ),
      (e: AppError) => e.code === "MEMBER_NOT_FOUND",
    );
    assert.equal(docs.find(record.id)?.title, input.title);
    assert.deepEqual(docs.findAttachment(record.id)?.data, attachment.data);
    db.close();
    db = openDatabase(path);
    members = createMemberRepository(db);
    docs = createDocumentRepository(db);
    assert.deepEqual(docs.find(record.id), record);
    assert.equal(members.find(mother.id)?.allergies, "青霉素");
    docs.update(record.id, {
      ...input,
      health: { ...health, memberId: father.id },
    });
    assert.equal(members.find(mother.id)?.recordCount, 1);
    assert.equal(members.find(father.id)?.recordCount, 2);
    assert.deepEqual(docs.findAttachment(record.id)?.data, attachment.data);
    docs.remove(older.id);
    assert.equal(members.remove(mother.id), true);
    assert.equal(docs.find(record.id)?.health?.memberId, father.id);
    docs.remove(record.id);
    assert.equal(docs.findAttachment(record.id), null);
    assert.equal(
      db
        .prepare("SELECT * FROM health_records WHERE document_id = ?")
        .get(record.id),
      undefined,
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("健康数据拒绝无效日期、缺失成员和普通资料混入健康关联", () => {
  assert.equal(
    memberSchema.safeParse({ name: "家人", birthDate: "2025-02-29" }).success,
    false,
  );
  assert.equal(
    memberSchema.safeParse({ name: "家人", birthDate: "2999-01-01" }).success,
    false,
  );
  assert.equal(memberSchema.safeParse({ name: "   " }).success, false);
  const input = {
    title: "病历",
    content: "医生原文记录",
    category: "健康档案",
  };
  assert.equal(documentSchema.safeParse(input).success, false);
  assert.equal(
    documentSchema.safeParse({ ...input, health: emptyHealthRecord() }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({
      ...input,
      category: "家庭事务",
      health: emptyHealthRecord(randomUUID()),
    }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({
      ...input,
      health: emptyHealthRecord(randomUUID()),
    }).success,
    true,
  );
});

test("图片与健康 AI 使用严格 JSON、校验输出及缺失日期，失败不伪造结果", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const photo = imageFile(await imageFixture());
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(
    analyzeImage(photo),
    (e: AppError) => e.code === "AI_NOT_CONFIGURED",
  );
  await assert.rejects(
    organizeHealth({ content: "医生写下的完整病历原文内容。" }),
    (e: AppError) => e.code === "AI_NOT_CONFIGURED",
  );
  process.env.OPENAI_API_KEY = "test-only-key";
  const imageResult = {
    title: "报告",
    content: "检查结果 5 mg，模糊内容【无法辨认】",
    uncertainties: ["日期无法辨认"],
  };
  const { memberId: _memberId, ...fields } = emptyHealthRecord();
  const healthResult = {
    ...fields,
    title: "复诊记录",
    summary: "原文记录，诊断待排。",
    tags: ["复诊"],
    uncertainties: ["原文未提供日期"],
  };
  void _memberId;
  let mode: "success" | "invalid" | "refusal" | "incomplete" | "bad-date" =
    "success";
  let calls = 0;
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (_request: unknown, init: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init.body));
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      const image = body.text.format.name === "family_image_analysis";
      if (image) {
        const part = body.input[0].content[1];
        assert.equal(part.type, "input_image");
        assert.equal(part.detail, "high");
        assert.match(part.image_url, /^data:image\/png;base64,/);
        const metadata = await sharp(
          Buffer.from(part.image_url.split(",")[1], "base64"),
        ).metadata();
        assert.equal(metadata.exif, undefined);
        assert.match(body.instructions, /不新增诊断/);
      } else {
        assert.equal(body.input[0].content, "医生写下的完整病历原文内容。");
        assert.match(body.instructions, /不能将“疑似\/待排”改为确诊/);
        assert.equal(body.text.format.schema.properties.memberId, undefined);
      }
      const expected = image
        ? imageResult
        : mode === "bad-date"
          ? { ...healthResult, occurredOn: "2025-02-30" }
          : healthResult;
      return Response.json({
        id: "resp_test",
        object: "response",
        created_at: 0,
        status: mode === "incomplete" ? "incomplete" : "completed",
        output: [
          {
            type: "message",
            id: "msg_test",
            role: "assistant",
            status: "completed",
            content:
              mode === "refusal"
                ? [{ type: "refusal", refusal: "Cannot process" }]
                : [
                    {
                      type: "output_text",
                      text:
                        mode === "invalid"
                          ? '{"title": 5}'
                          : JSON.stringify(expected),
                      annotations: [],
                    },
                  ],
          },
        ],
      });
    },
  );
  try {
    assert.deepEqual(await analyzeImage(photo), imageResult);
    assert.deepEqual(
      await organizeHealth({ content: "医生写下的完整病历原文内容。" }),
      healthResult,
    );
    assert.equal(
      healthOrganizationSchema.safeParse({
        ...healthResult,
        occurredOn: "2025-02-30",
      }).success,
      false,
    );
    for (const [next, code] of [
      ["invalid", "AI_INVALID_OUTPUT"],
      ["refusal", "AI_REFUSED"],
      ["incomplete", "AI_INCOMPLETE"],
      ["bad-date", "AI_INVALID_OUTPUT"],
    ] as const) {
      mode = next;
      await assert.rejects(
        organizeHealth({ content: "医生写下的完整病历原文内容。" }),
        (e: AppError) => e.code === code,
      );
    }
    assert.equal(calls, 6);
  } finally {
    fetchMock.mock.restore();
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("跨 AI 入口并发会被拦截，失败后释放调用锁", async () => {
  let release!: () => void;
  const first = runExclusiveAI(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await assert.rejects(
    runExclusiveAI(async () => "second"),
    (e: AppError) => e.code === "AI_BUSY",
  );
  release();
  await first;
  await assert.rejects(
    runExclusiveAI(async () => {
      throw new Error("test failure");
    }),
  );
  assert.equal(await runExclusiveAI(async () => "available"), "available");
});
