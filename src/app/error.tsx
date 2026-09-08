"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fatal-error">
      <h1>页面暂时没有打开</h1>
      <p>请重试。如果问题持续，请检查本地服务是否正常运行。</p>
      <button className="button primary" onClick={reset}>
        重新加载
      </button>
    </main>
  );
}
