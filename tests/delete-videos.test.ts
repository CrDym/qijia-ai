import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteVideos } from "../src/lib/delete-videos.ts";

test("批量删除只请求勾选项，重复项不重复请求，已不存在的视频可安全重试", async () => {
  const calls: string[] = [];
  const result = await deleteVideos(["a", "b", "a"], async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.method, "DELETE");
    return new Response(null, {
      status: String(url).endsWith("b") ? 404 : 204,
    });
  });
  assert.deepEqual(calls, ["/api/dance/a", "/api/dance/b"]);
  assert.deepEqual(result, { removed: ["a", "b"], failure: "" });
});
test("部分删除失败即停止，保留成功结果和后续未处理项", async () => {
  const calls: string[] = [];
  const result = await deleteVideos(["a", "b", "c"], async (url) => {
    calls.push(String(url));
    return String(url).endsWith("b")
      ? Response.json({ error: { message: "文件无法删除" } }, { status: 500 })
      : new Response(null, { status: 204 });
  });
  assert.deepEqual(result, { removed: ["a"], failure: "文件无法删除" });
  assert.equal(calls.length, 2);
});
test("网络中断不把结果不确定的视频当成删除成功，空选择不发送请求", async () => {
  const result = await deleteVideos(["a", "b"], async () => {
    throw new Error("连接中断");
  });
  assert.deepEqual(result, { removed: [], failure: "连接中断" });
  assert.deepEqual(
    await deleteVideos([], async () => {
      throw new Error("不应调用");
    }),
    { removed: [], failure: "" },
  );
});
