import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppError } from "../src/lib/api.ts";
import { openDatabase } from "../src/lib/database.ts";
import { createDocumentRepository } from "../src/repositories/documents.ts";
import { documentSchema } from "../src/schemas/document.ts";
import { MAX_FILE_BYTES } from "../src/schemas/attachment.ts";
import { extractFile } from "../src/services/files/extract-text.ts";
import {
  validateFile,
  type AttachmentData,
} from "../src/services/files/validate-file.ts";
import {
  readDocumentWrite,
  readMultipart,
  singleFile,
} from "../src/services/files/read-upload.ts";
import { docxFixture, pdfFixture } from "./file-fixtures.ts";

function file(name: string, data: Buffer | string): File {
  return new File(
    [typeof data === "string" ? data : Uint8Array.from(data)],
    name,
  );
}
const documentInput = documentSchema.parse({
  title: "家电维护",
  content: "厨房滤芯 ABC-100",
  category: "物品资料",
});

test("四种文件提取真实文字且不调用 AI；空 PDF 提示扫描件，不编造正文", async () => {
  const network = mock.method(globalThis, "fetch", () => {
    throw new Error("Extraction must not make network requests");
  });
  try {
    assert.equal(
      (await extractFile(file("家电.txt", "\ufeff厨房\r\n滤芯 ABC-100")))
        .content,
      "厨房\n滤芯 ABC-100",
    );
    assert.equal(
      (await extractFile(file("经验.md", "# 维修\n\n记录保留原格式。")))
        .content,
      "# 维修\n\n记录保留原格式。",
    );
    assert.equal(
      (
        await extractFile(
          file(
            "中文.txt",
            Buffer.concat([
              Buffer.from([0xff, 0xfe]),
              Buffer.from("中文记录", "utf16le"),
            ]),
          ),
        )
      ).content,
      "中文记录",
    );
    const docx = await extractFile(file("使用说明.docx", docxFixture()));
    assert.match(docx.content, /厨房净水器滤芯型号 ABC-100/);
    assert.equal(docx.title, "使用说明");
    assert.equal(
      docx.attachment.mimeType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.match(
      (await extractFile(file("manual.pdf", pdfFixture()))).content,
      /Family filter model ABC-100/,
    );
    const scanned = await extractFile(file("扫描件.pdf", pdfFixture("")));
    assert.equal(scanned.content, "");
    assert.match(scanned.warning!, /扫描版 PDF/);
    assert.equal(network.mock.callCount(), 0);
  } finally {
    network.mock.restore();
  }
});

test("文件类型、大小、二进制伪装、损坏和过长内容有明确拒绝结果", async () => {
  const cases: [File, string][] = [
    [file("旧文档.doc", "old document"), "UNSUPPORTED_FILE"],
    [file("图片.png", "image"), "INVALID_IMAGE"],
    [file("图片.svg", "<svg/>"), "UNSUPPORTED_FILE"],
    [file("空.txt", ""), "EMPTY_FILE"],
    [file("超大.txt", Buffer.alloc(MAX_FILE_BYTES + 1)), "TOO_LARGE"],
    [file("假.pdf", "not a PDF"), "INVALID_FILE"],
    [file("坏.pdf", "%PDF-1.7\nbroken"), "FILE_PARSE_ERROR"],
    [file("假.docx", "not a Word file"), "INVALID_FILE"],
    [file("二进制.txt", Buffer.from([0, 1, 2, 3])), "INVALID_FILE"],
    [file("错误编码.txt", Buffer.from([0xff, 0xff, 0x80])), "TEXT_ENCODING"],
    [file("过长.txt", "字".repeat(20001)), "TEXT_TOO_LONG"],
    [file("太多页.pdf", pdfFixture("text", 101)), "TOO_MANY_PAGES"],
  ];
  for (const [input, code] of cases)
    await assert.rejects(
      extractFile(input),
      (error: AppError) => error.code === code,
      input.name,
    );
});

test("multipart 同样限制体积和来源；保存时再次校验原文件", async () => {
  const form = new FormData();
  form.set("document", JSON.stringify(documentInput));
  form.set("file", file("滤芯说明.txt", "滤芯 ABC-100"));
  const request = () =>
    new Request("http://localhost:3000/api/documents", {
      method: "POST",
      headers: { host: "localhost:3000" },
      body: form,
    });
  const result = await readDocumentWrite(request());
  assert.deepEqual(result.data, documentInput);
  assert.equal(result.attachment?.data.toString(), "滤芯 ABC-100");
  assert.equal(result.attachment?.mimeType, "text/plain");
  form.set("file", file("伪装.pdf", "binary"));
  await assert.rejects(
    readDocumentWrite(request()),
    (error: AppError) => error.code === "INVALID_FILE",
  );
  const multiple = new FormData();
  multiple.append("file", file("a.txt", "a"));
  multiple.append("file", file("b.txt", "b"));
  assert.throws(
    () => singleFile(multiple),
    (error: AppError) => error.code === "INVALID_UPLOAD",
  );
  await assert.rejects(
    readMultipart(
      new Request("http://localhost:3000", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "https://external.example" },
        body: form,
      }),
    ),
    (error: AppError) => error.status === 403,
  );
  await assert.rejects(
    readMultipart(
      new Request("http://localhost:3000", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=x",
          "content-length": String(MAX_FILE_BYTES * 2),
        },
        body: "x",
      }),
    ),
    (error: AppError) => error.status === 413,
  );
});

test("原文件与资料原子保存、跨连接保留；编辑保留附件，替换移除删除同步生效", async () => {
  const directory = mkdtempSync(join(tmpdir(), "family-attachments-"));
  const path = join(directory, "test.sqlite");
  let db = openDatabase(path);
  try {
    let repo = createDocumentRepository(db);
    const attachment = await validateFile(file("厨房原件.docx", docxFixture()));
    const created = repo.create(documentInput, attachment);
    db.close();
    db = openDatabase(path);
    repo = createDocumentRepository(db);
    assert.equal(repo.find(created.id)?.attachment?.name, "厨房原件.docx");
    assert.deepEqual(repo.findAttachment(created.id)?.data, attachment.data);
    const list = repo.list("厨房原件");
    assert.equal(list.documents[0].id, created.id);
    assert.equal("data" in list.documents[0].attachment!, false);
    repo.update(created.id, { ...documentInput, title: "只编辑文字" });
    assert.deepEqual(repo.findAttachment(created.id)?.data, attachment.data);
    const replacement = await validateFile(file("新原件.txt", "新原件内容"));
    repo.update(created.id, documentInput, replacement);
    assert.equal(repo.findAttachment(created.id)?.name, "新原件.txt");
    repo.update(created.id, documentInput, null);
    assert.equal(repo.findAttachment(created.id), null);
    assert.ok(repo.find(created.id));
    repo.update(created.id, documentInput, replacement);
    repo.remove(created.id);
    assert.equal(repo.findAttachment(created.id), null);
    const broken = { ...replacement, name: null } as unknown as AttachmentData;
    assert.throws(() => repo.create(documentInput, broken));
    assert.equal(repo.list().total, 0, "附件失败时资料也应回滚");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("已有文字资料库升级后内容保留，不要求重建数据库", () => {
  const directory = mkdtempSync(join(tmpdir(), "family-legacy-"));
  const path = join(directory, "legacy.sqlite");
  let db = new DatabaseSync(path);
  try {
    db.exec(`CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO documents VALUES ('old', '已有资料', '旧原文', '', '家庭事务', '[]', '', '2026-01-01', '2026-01-01');`);
    db.close();
    db = openDatabase(path);
    const repo = createDocumentRepository(db);
    assert.equal(repo.find("old")?.content, "旧原文");
    assert.equal(repo.find("old")?.attachment, null);
    assert.equal(repo.list().total, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
