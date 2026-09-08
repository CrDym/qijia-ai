"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { Icon } from "./icon";
import { apiRequest } from "@/lib/client";
import type { AISettingsStatus } from "@/schemas/ai-settings";

export function AISettingsWorkspace({
  initialStatus,
}: {
  initialStatus: AISettingsStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initialStatus.model);
  const [busy, setBusy] = useState<"save" | "test" | "reset" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = Boolean(apiKey) || model !== status.model;

  useEffect(() => {
    if (!dirty && !busy) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, busy]);

  function guardNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (busy || (dirty && !window.confirm("配置尚未保存，确定离开吗？")))
      event.preventDefault();
  }

  async function act(action: "save" | "test" | "reset") {
    if (busy) return;
    if (
      action === "reset" &&
      !window.confirm(
        "清除页面保存的密钥和模型设置？之后会使用环境变量；环境变量没有密钥时将停用 AI。",
      )
    )
      return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      if (action === "test") {
        const result = await apiRequest<{ message: string }>(
          "/api/settings/ai/test",
          { method: "POST" },
        );
        setNotice(result.message);
      } else {
        const result = await apiRequest<AISettingsStatus>("/api/settings/ai", {
          method: action === "save" ? "PUT" : "DELETE",
          ...(action === "save"
            ? { body: JSON.stringify({ apiKey, model }) }
            : {}),
        });
        setStatus(result);
        setApiKey("");
        setModel(result.model);
        setNotice(
          action === "save"
            ? "配置已保存并立即生效。可点击测试连接确认是否可用。"
            : "已清除页面配置，恢复环境变量设置。",
        );
        // 清除客户端页面缓存，使返回资料库/健康页时重新读取 AI 状态。
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作未完成，请重试");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="workspace settings-workspace">
      <aside className="sidebar">
        <Link
          className="brand"
          href="/"
          aria-label="栖家首页"
          onClick={guardNavigation}
        >
          <span className="brand-symbol">
            <Icon name="home" size={22} />
          </span>
          <span>
            栖家<span className="brand-en">A PLACE FOR HOME</span>
          </span>
        </Link>
        <div className="home-label">
          <span className="home-dot" />
          我的家庭
        </div>
        <nav aria-label="家庭工具">
          <p className="nav-caption">家庭工作台</p>
          <Link className="nav-item" href="/" onClick={guardNavigation}>
            <Icon name="library" />
            <span>家庭资料库</span>
          </Link>
          <Link className="nav-item" href="/health" onClick={guardNavigation}>
            <Icon name="heart" />
            <span>家庭健康</span>
          </Link>
          <Link
            className="nav-item active"
            href="/settings"
            aria-current="page"
            onClick={guardNavigation}
          >
            <Icon name="settings" />
            <span>AI 设置</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="sparkle" size={19} />
            <p>让整理，轻松一点。</p>
            <span>把琐碎交给工具，把时间留给家人。</span>
          </div>
          <div className="sidebar-version">
            <span>家庭 AI 工作台</span>
            <span>V0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Icon name="home" size={16} />
            <span>我的家庭</span>
            <Icon name="chevron" size={12} />
            <strong>AI 设置</strong>
          </div>
          <span className="topbar-label">按你的需要，开启 AI</span>
        </header>
        <main className="main-content">
          <div className="workspace-tabs">
            <Link href="/" onClick={guardNavigation}>
              家庭资料库
            </Link>
            <Link href="/health" onClick={guardNavigation}>
              家庭健康 <Icon name="heart" size={14} />
            </Link>
            <Link
              href="/settings"
              aria-current="page"
              onClick={guardNavigation}
            >
              AI 设置
            </Link>
          </div>
          <section className="page-heading">
            <div>
              <p className="eyebrow">A LITTLE HELP FOR EVERYDAY LIFE</p>
              <h1>
                为家，添一份 AI 助力<span className="heading-dot">。</span>
              </h1>
              <p className="page-description">
                连接后，即可使用资料整理、图片识别和健康记录整理。
              </p>
            </div>
          </section>
          <section className="settings-card" aria-labelledby="settings-title">
            <div className="settings-card-heading">
              <span className="overview-icon">
                <Icon name="sparkle" size={25} />
              </span>
              <div>
                <h2 id="settings-title">OpenAI 配置</h2>
                <p>一个设置，供所有 AI 功能使用。</p>
              </div>
              <span
                className={`settings-status ${status.configured ? "configured" : ""}`}
              >
                {status.configured ? "密钥已配置" : "尚未配置"}
              </span>
            </div>
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                void act("save");
              }}
            >
              <fieldset disabled={Boolean(busy)}>
                <div className="field">
                  <div className="field-label">
                    <label htmlFor="ai-api-key">API Key</label>
                    <span>仅用于服务端调用</span>
                  </div>
                  <input
                    id="ai-api-key"
                    name="api-key"
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    maxLength={512}
                    value={apiKey}
                    placeholder={
                      status.configured
                        ? "已配置密钥；留空保留，输入新值替换"
                        : "输入你的 OpenAI API Key"
                    }
                    aria-describedby="key-help"
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setNotice("");
                    }}
                  />
                  <p id="key-help" className="settings-help">
                    当前密钥来源：
                    {status.keySource === "saved"
                      ? "页面配置"
                      : status.keySource === "environment"
                        ? "服务端环境变量"
                        : "未设置"}
                    。保存后不会回显密钥，也不会写入浏览器存储。
                  </p>
                </div>
                <div className="field">
                  <div className="field-label">
                    <label htmlFor="ai-model">模型名称</label>
                  </div>
                  <input
                    id="ai-model"
                    name="model"
                    required
                    maxLength={100}
                    autoComplete="off"
                    spellCheck={false}
                    value={model}
                    placeholder="gpt-4.1-mini"
                    aria-describedby="model-help"
                    onChange={(event) => {
                      setModel(event.target.value);
                      setNotice("");
                    }}
                  />
                  <p id="model-help" className="settings-help">
                    沿用默认模型
                    gpt-4.1-mini，或填写你有权限使用的模型。需支持图片输入、Responses
                    API 和结构化输出。
                  </p>
                </div>
              </fieldset>
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="settings-notice" role="status">
                  {notice}
                </p>
              )}
              <div className="settings-actions">
                <button
                  className="button primary"
                  type="submit"
                  disabled={Boolean(busy) || !dirty}
                >
                  <Icon name="check" size={16} />
                  {busy === "save" ? "保存中…" : "保存配置"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={Boolean(busy) || dirty || !status.configured}
                  onClick={() => void act("test")}
                >
                  {busy === "test" ? "测试中…" : "测试连接"}
                </button>
                <button
                  className="button secondary settings-reset"
                  type="button"
                  disabled={Boolean(busy) || !status.hasSavedSettings}
                  onClick={() => void act("reset")}
                >
                  {busy === "reset" ? "恢复中…" : "恢复环境配置"}
                </button>
              </div>
              <p className="settings-help">
                {dirty
                  ? "有未保存的修改，请先保存再测试。"
                  : "测试使用当前已生效的配置，仅发送固定测试文字，会产生少量 API 用量，不会发送家庭资料。"}
              </p>
            </form>
          </section>
          <aside className="settings-footnote">
            <h2>配置与资料，都留在你的服务端</h2>
            <p>
              页面保存的配置优先于环境变量，保存后无需重启。未设置密钥时，仍可手动管理资料和健康档案。
            </p>
            <p>
              密钥保存在本机数据库中，当前未加密，备份也会包含密钥。请妥善保管；本版没有登录保护，能访问平台的人也能修改配置。
            </p>
          </aside>
        </main>
      </div>
    </div>
  );
}
