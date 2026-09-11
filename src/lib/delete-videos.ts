// 顺序删除，只移除已确认成功的项目；失败即停止，便于用户核对和重试。
export async function deleteVideos(
  ids: string[],
  request: typeof fetch = fetch,
) {
  const removed: string[] = [];
  let failure = "";
  for (const id of [...new Set(ids)]) {
    try {
      const response = await request(`/api/dance/${id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message || "删除失败，请稍后重试");
      }
      removed.push(id);
    } catch (error) {
      failure = error instanceof Error ? error.message : "连接中断";
      break;
    }
  }
  return { removed, failure };
}
