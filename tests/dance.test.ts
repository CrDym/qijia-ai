import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/lib/database.ts";
import { createDanceRepository } from "../src/repositories/dance.ts";
import { danceInputSchema, MAX_VIDEO_SIZE } from "../src/schemas/dance.ts";
import {
  byteRange,
  danceDirectory,
  saveVideo,
} from "../src/services/dance/storage.ts";
import { GET, POST } from "../src/app/api/dance/route.ts";
import { PATCH, DELETE } from "../src/app/api/dance/[id]/route.ts";
import { GET as getFile, HEAD } from "../src/app/api/dance/[id]/file/route.ts";
const fakeMp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypisom00000000fictional-video"),
]);
function request(
  body: BodyInit = fakeMp4,
  query = "date=2026-09-10&kind=practice&name=test.mp4",
) {
  return new Request(`http://localhost/api/dance?${query}`, {
    method: "POST",
    headers: {
      "content-type": "video/mp4",
      host: "localhost",
      origin: "http://localhost",
    },
    body,
  });
}
test("日期校验与视频范围请求覆盖边界", () => {
  assert.equal(
    danceInputSchema.safeParse({ date: "2026-02-30", kind: "practice" })
      .success,
    false,
  );
  assert.equal(
    danceInputSchema.safeParse({ date: "2026-02-20", kind: "other" }).success,
    false,
  );
  assert.deepEqual(byteRange("bytes=3-8", 10), { start: 3, end: 8 });
  assert.deepEqual(byteRange("bytes=3-", 10), { start: 3, end: 9 });
  assert.deepEqual(byteRange("bytes=-4", 10), { start: 6, end: 9 });
  assert.deepEqual(byteRange("bytes=0-99", 10), { start: 0, end: 9 });
  for (const value of [
    "bytes=10-",
    "bytes=-0",
    "bytes=9-2",
    "bytes=0-1,4-5",
    "bytes=-",
    "bad",
  ])
    assert.throws(() => byteRange(value, 10));
});
test("独立视频元数据持久保存，修改分组不影响文件信息", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qijia-dance-db-"));
  let db = openDatabase(join(dir, "test.sqlite"));
  try {
    let repo = createDanceRepository(db);
    const item = {
      id: "test",
      date: "2026-09-10",
      kind: "showcase" as const,
      name: "虚构视频.mp4",
      size: 100,
      createdAt: "2026-09-10T00:00:00Z",
    };
    repo.create(item);
    db.close();
    db = openDatabase(join(dir, "test.sqlite"));
    repo = createDanceRepository(db);
    assert.deepEqual({ ...repo.find("test") }, item);
    assert.equal(
      repo.update("test", { date: "2026-09-09", kind: "practice" })?.size,
      100,
    );
    assert.equal(repo.list()[0].kind, "practice");
    assert.equal(
      repo.update("missing", { date: "2026-09-09", kind: "practice" }),
      undefined,
    );
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("视频接口上传、范围播放、修改、来源校验和删除；失败不留半成品", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qijia-dance-api-"));
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  try {
    const created = await POST(request());
    assert.equal(created.status, 201);
    const video = await created.json();
    const context = { params: Promise.resolve({ id: video.id }) };
    assert.deepEqual(
      await readFile(join(danceDirectory(), `${video.id}.mp4`)),
      fakeMp4,
    );
    assert.equal((await (await GET()).json()).length, 1);
    const range = await getFile(
      new Request("http://localhost", { headers: { range: "bytes=4-7" } }),
      context,
    );
    assert.equal(range.status, 206);
    assert.equal(await range.text(), "ftyp");
    const head = await HEAD(new Request("http://localhost"), context);
    assert.equal(head.headers.get("content-length"), String(fakeMp4.length));
    assert.equal(await head.text(), "");
    const badRange = await getFile(
      new Request("http://localhost", { headers: { range: "bytes=999-" } }),
      context,
    );
    assert.equal(badRange.status, 416);
    assert.equal(
      badRange.headers.get("content-range"),
      `bytes */${fakeMp4.length}`,
    );
    const edit = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: "2026-09-08", kind: "showcase" }),
      }),
      context,
    );
    assert.equal((await edit.json()).date, "2026-09-08");
    const forbidden = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { host: "localhost", origin: "https://elsewhere.example" },
      }),
      context,
    );
    assert.equal(forbidden.status, 403);
    assert.equal(
      (await POST(request(Buffer.from("not-video-content")))).status,
      400,
    );
    assert.equal(
      (await POST(request(fakeMp4, "date=2026-02-30&kind=practice&name=a.mp4")))
        .status,
      400,
    );
    const tooLarge = new Request("http://localhost", {
      method: "POST",
      headers: { "content-length": String(MAX_VIDEO_SIZE + 1) },
      body: fakeMp4,
    });
    await assert.rejects(saveVideo(tooLarge, "oversized"));
    const broken = new ReadableStream({
      start(controller) {
        controller.enqueue(fakeMp4);
        controller.error(new Error("interrupted"));
      },
    });
    await assert.rejects(
      saveVideo(
        new Request("http://localhost", {
          method: "POST",
          body: broken,
          duplex: "half",
        } as RequestInit),
        "broken",
      ),
    );
    assert.deepEqual(await readdir(danceDirectory()), [`${video.id}.mp4`]);
    assert.equal(
      (
        await DELETE(
          new Request("http://localhost", { method: "DELETE" }),
          context,
        )
      ).status,
      204,
    );
    assert.deepEqual(await readdir(danceDirectory()), []);
    assert.equal(
      (await getFile(new Request("http://localhost"), context)).status,
      404,
    );
    assert.equal((await (await GET()).json()).length, 0);
  } finally {
    (
      globalThis as typeof globalThis & {
        familyDatabase?: import("node:sqlite").DatabaseSync;
      }
    ).familyDatabase?.close();
    delete (
      globalThis as typeof globalThis & {
        familyDatabase?: import("node:sqlite").DatabaseSync;
      }
    ).familyDatabase;
    await rm(dir, { recursive: true, force: true });
  }
});
