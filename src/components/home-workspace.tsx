"use client";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/client";
import { dueGroup, homeToday } from "@/lib/dates";
import type { Activity } from "@/schemas/activity";
import { HomeComposer } from "./home-composer";
import { ActivityCard } from "./activity-card";
import { Icon, type IconName } from "./icon";

const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "今日生活", icon: "home" },
  { href: "/library", label: "家庭资料库", icon: "library" },
  { href: "/health", label: "家庭健康", icon: "heart" },
  { href: "/dance", label: "街舞成长册", icon: "video" },
  { href: "/settings", label: "AI 设置", icon: "settings" },
];
const groups = [
  {
    key: "overdue",
    label: "已逾期",
    description: "可以完成它，也可以重新安排",
  },
  { key: "today", label: "今天", description: "把注意力留给今天的事" },
  { key: "upcoming", label: "未来 7 天", description: "提前一点，心里有数" },
  { key: "undated", label: "未定日期", description: "慢慢处理，不急着安排" },
  { key: "later", label: "更晚的安排", description: "到时候，会在首页出现" },
  { key: "completed", label: "已完成", description: "做过的事，也有迹可循" },
] as const;

export function HomeWorkspace({
  aiConfigured,
  initialToday,
}: {
  aiConfigured: boolean;
  initialToday: string;
}) {
  const [today, setToday] = useState(initialToday);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [composerDirty, setComposerDirty] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const dirty = composerDirty || Boolean(editingId);
  useEffect(() => {
    const update = () => setToday(homeToday());
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Activity[]>("/api/activities", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setActivities(value);
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  function guardNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (
      dirty &&
      !window.confirm("还有未保存的内容，离开将丢失这些修改。确定离开吗？")
    )
      event.preventDefault();
  }
  const saved = useCallback(() => {
    setRevision((value) => value + 1);
    setToast("已保存，生活又有条理了一点");
  }, []);
  const active = activities.filter((value) => !value.completed);
  const attentionCount = active.filter((value) =>
    ["today", "overdue"].includes(dueGroup(value.dueOn, today)),
  ).length;
  const formattedDate = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Shanghai",
  }).format(new Date(`${today}T00:00:00+08:00`));
  return (
    <div
      className="workspace"
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (
          anchor &&
          anchor.target !== "_blank" &&
          !anchor.hasAttribute("download")
        )
          guardNavigation(event as unknown as MouseEvent<HTMLAnchorElement>);
      }}
    >
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="栖家首页">
          <span className="brand-symbol">
            <Icon name="home" size={22} />
          </span>
          <span>
            栖家<span className="brand-en">A PLACE FOR HOME</span>
          </span>
        </Link>
        <div className="home-label">
          <span className="home-dot" />
          我的家庭<span className="home-label-badge">个人空间</span>
        </div>
        <nav aria-label="主导航">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-item ${link.href === "/" ? "active" : ""}`}
              aria-current={link.href === "/" ? "page" : undefined}
            >
              <Icon name={link.icon} />
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="book" size={19} />
            <p>少记一点，多从容一点。</p>
            <span>让家的日常，有处安放。</span>
          </div>
          <div className="sidebar-version">
            <span>栖家 · 日常生活</span>
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
            <strong>今日生活</strong>
          </div>
          <span className="topbar-label">
            <span className="home-dot" />
            把琐碎交给栖家
          </span>
        </header>
        <main className="main-content home-content">
          <nav className="workspace-tabs" aria-label="工作台">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.href === "/" ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <section className="page-heading home-heading">
            <div>
              <p className="eyebrow">A LITTLE LESS TO REMEMBER</p>
              <h1>
                日常小事，安心交给栖家<span className="heading-dot">。</span>
              </h1>
              <p className="page-description">
                发来一段文字、一张图片或一个文件，让 AI 帮你整理下一步。
              </p>
            </div>
            <div className="home-date">
              <Icon name="calendar" size={20} />
              <span>{formattedDate}</span>
              <small>北京时间</small>
            </div>
          </section>
          <HomeComposer
            aiConfigured={aiConfigured}
            onSaved={saved}
            onDirtyChange={setComposerDirty}
          />
          <section className="home-agenda" aria-label="生活事项">
            <div className="section-heading">
              <div>
                <p className="eyebrow">MAKE ROOM FOR TODAY</p>
                <h2>今天需要关注什么</h2>
              </div>
              <span>
                {loading
                  ? "加载中…"
                  : `${attentionCount} 项需关注 · ${active.length} 项未完成`}
              </span>
            </div>
            <p className="agenda-note">
              按北京时间的日期归集；暂不发送手机或邮件提醒。
            </p>
            {error ? (
              <p role="alert" className="inline-error">
                {error}{" "}
                <button
                  className="text-button"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  重新加载
                </button>
              </p>
            ) : loading ? (
              <p className="empty-agenda" role="status">
                正在查看家里的安排…
              </p>
            ) : (
              <>
                {attentionCount === 0 && (
                  <div className="empty-agenda">
                    <span className="agenda-check">
                      <Icon name="check" size={24} />
                    </span>
                    <div>
                      <h3>今天暂时没有要赶的事</h3>
                      <p>
                        {active.length
                          ? "其他安排都在下方，需要时再处理。"
                          : "试着在上方输入一件事，确认后就会出现在这里。"}
                      </p>
                    </div>
                  </div>
                )}
                {groups.map((group) => {
                  const values = activities.filter((value) =>
                    group.key === "completed"
                      ? value.completed
                      : !value.completed &&
                        dueGroup(value.dueOn, today) === group.key,
                  );
                  if (!values.length) return null;
                  return (
                    <details
                      className={`agenda-group agenda-${group.key}`}
                      key={group.key}
                      open={
                        group.key === "overdue" ||
                        group.key === "today" ||
                        group.key === "upcoming" ||
                        undefined
                      }
                    >
                      <summary>
                        <span>
                          {group.label} <b>{values.length}</b>
                        </span>
                        <small>{group.description}</small>
                      </summary>
                      <div className="agenda-grid">
                        {values.map((activity) => (
                          <ActivityCard
                            key={activity.id}
                            activity={activity}
                            editing={editingId === activity.id}
                            onEdit={(value) => {
                              if (
                                value &&
                                editingId &&
                                editingId !== activity.id &&
                                !window.confirm(
                                  "切换编辑会放弃另一条事项的未保存修改，继续吗？",
                                )
                              )
                                return;
                              setEditingId((current) =>
                                value
                                  ? activity.id
                                  : current === activity.id
                                    ? null
                                    : current,
                              );
                            }}
                            onUpdated={(value) =>
                              setActivities((current) =>
                                current.map((row) =>
                                  row.id === value.id ? value : row,
                                ),
                              )
                            }
                            onRemoved={() => {
                              setActivities((current) =>
                                current.filter((row) => row.id !== activity.id),
                              );
                              setToast(
                                "事项及其原文件已删除，无法在应用内撤销",
                              );
                            }}
                          />
                        ))}
                      </div>
                    </details>
                  );
                })}
              </>
            )}
          </section>
          <footer className="home-footer">
            <span>资料留得住，生活理得顺。</span>
            <Link href="/library">
              到资料库找一找 <Icon name="arrow" size={14} />
            </Link>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
