import { test, mock } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { getDatabase } from "../src/lib/database.ts";
import { POST } from "../src/app/api/documents/prepare/route.ts";
import { captureDraft } from "../src/schemas/capture.ts";
import { documentSchema } from "../src/schemas/document.ts";
import { pdfFixture } from "./file-fixtures.ts";

process.env.DATABASE_PATH = ":memory:";
process.env.OPENAI_API_KEY = "fake-capture-key";
delete process.env.OPENAI_BASE_URL;

const metadata = {
  title: "净水器滤芯资料",
  summary: "厨房净水器滤芯型号为 ABC-100。",
  category: "物品资料",
  tags: ["滤芯"],
  health: null,
  uncertainties: [],
};
function response(result: unknown) {
  return Response.json({
    id: "resp_capture",
    object: "response",
    created_at: 0,
    status: "completed",
    output: [
      {
        type: "message",
        id: "msg_capture",
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
function request(input: unknown, origin = "http://localhost:3000") {
  const multipart = input instanceof FormData;
  return new Request("http://localhost:3000/api/documents/prepare", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin,
      ...(multipart ? {} : { "content-type": "application/json" }),
    },
    body: multipart ? input : JSON.stringify(input),
  });
}
function upload(file: File) {
  const form = new FormData();
  form.set("file", file);
  return form;
}

test("文字和文件直接生成完整分类草稿，保留原文及来源，确认前不写入资料库", async (t) => {
  const inputs: string[] = [];
  const network = mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      inputs.push(body.input[0].content);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.equal(body.store, false);
      return response(metadata);
    },
  );
  t.after(() => network.mock.restore());
  const original = "厨房净水器滤芯 ABC-100。\n不要改变这一行的原文。";
  let result = await POST(request({ content: original }));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(await result.json(), {
    ...metadata,
    content: original,
    source: "",
  });
  result = await POST(request(upload(new File([original], "原始资料.txt"))));
  const draft = await result.json();
  assert.equal(draft.source, "原始资料.txt");
  assert.equal(draft.content, original);
  assert.equal(draft.category, "物品资料");
  assert.ok(documentSchema.safeParse(captureDraft(draft)).success);
  assert.deepEqual(inputs, [original, original]);
  assert.equal(
    getDatabase().prepare("SELECT COUNT(*) AS count FROM documents").get()
      ?.count,
    0,
  );
});

test("图片一次请求完成识别和整理，展示不确定项；健康成员必须人工确认", async (t) => {
  const health = {
    recordType: "检查报告",
    occurredOn: "",
    hospital: "虚构医院",
    diagnosis: "原文：待进一步检查",
    medications: "",
    followUp: "",
  };
  let result: unknown = {
    ...metadata,
    category: "健康档案",
    health,
    content: "检查报告：待进一步检查",
    uncertainties: ["日期不完整，未填写"],
  };
  const network = mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.text.format.name, "family_capture_image");
      assert.equal(body.input[0].content.length, 2);
      assert.ok(
        body.input[0].content[1].image_url.startsWith("data:image/png;base64,"),
      );
      assert.equal(
        body.text.format.schema.properties.health.anyOf[0].properties.memberId,
        undefined,
      );
      return response(result);
    },
  );
  t.after(() => network.mock.restore());
  const png = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const file = new File([Uint8Array.from(png)], "虚构报告.png");
  let reply = await POST(request(upload(file)));
  assert.equal(reply.status, 200);
  const prepared = await reply.json();
  assert.equal(network.mock.callCount(), 1, "不需要第二次整理图片文字");
  assert.deepEqual(prepared.uncertainties, ["日期不完整，未填写"]);
  const draft = captureDraft(prepared);
  assert.equal(draft.health?.memberId, "");
  assert.equal(documentSchema.safeParse(draft).success, false);
  result = { ...prepared, source: undefined, content: "" };
  reply = await POST(request(upload(file)));
  assert.equal((await reply.json()).error.code, "NO_READABLE_CONTENT");
});

test("无效分类关联、模型拒答与缺少配置不给出可保存的伪草稿", async (t) => {
  let kind = "inconsistent";
  const network = mock.method(globalThis, "fetch", async () => {
    if (kind === "refusal")
      return Response.json({
        id: "resp_refused",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            id: "msg_refused",
            role: "assistant",
            status: "completed",
            content: [{ type: "refusal", refusal: "Cannot process" }],
          },
        ],
      });
    return response({ ...metadata, category: "健康档案", health: null });
  });
  t.after(() => {
    network.mock.restore();
    process.env.OPENAI_API_KEY = "fake-capture-key";
  });
  let reply = await POST(request({ content: "这是一份虚构报告" }));
  assert.equal((await reply.json()).error.code, "AI_INVALID_OUTPUT");
  kind = "refusal";
  reply = await POST(request({ content: "这是一份虚构报告" }));
  assert.equal((await reply.json()).error.code, "AI_REFUSED");
  delete process.env.OPENAI_API_KEY;
  reply = await POST(request({ content: "这是一份虚构报告" }));
  assert.equal((await reply.json()).error.code, "AI_NOT_CONFIGURED");
  assert.equal(network.mock.callCount(), 2);
});

test("空内容、跨来源、伪装文件、扫描 PDF 与混合输入在 AI 调用前拒绝", async (t) => {
  const network = mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected network");
  });
  t.after(() => network.mock.restore());
  assert.equal((await POST(request({ content: "" }))).status, 400);
  assert.equal(
    (await POST(request({ content: "x".repeat(20001) }))).status,
    400,
  );
  assert.equal(
    (await POST(request({ content: "虚构资料" }, "https://other.example")))
      .status,
    403,
  );
  const mixed = upload(new File(["虚构资料"], "资料.txt"));
  mixed.set("content", "另一份资料");
  assert.equal((await POST(request(mixed))).status, 400);
  assert.ok(
    (await POST(request(upload(new File(["not a png"], "伪装.png"))))).status >=
      400,
  );
  const scan = await POST(
    request(upload(new File([Uint8Array.from(pdfFixture(""))], "扫描件.pdf"))),
  );
  assert.equal((await scan.json()).error.code, "NO_READABLE_CONTENT");
  assert.equal(network.mock.callCount(), 0);
});
