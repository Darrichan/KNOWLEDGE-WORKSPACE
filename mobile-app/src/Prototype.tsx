import {
  ArrowLeftIcon,
  CheckCircledIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CounterClockwiseClockIcon,
  DotsHorizontalIcon,
  FileIcon,
  FilePlusIcon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  LayersIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
  Pencil1Icon,
  PersonIcon,
  PlusIcon,
  ReaderIcon,
  RowsIcon,
  Share2Icon,
  TableIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BottomSheet,
  Carousel,
  KeyboardInput,
  KeyboardTextarea,
  MobileScroll,
  useKeyboard,
} from "./mobile";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:18000/api/v1").replace(/\/$/, "");

type User = { id: string; public_id: string; email: string; display_name: string };
type Workspace = { id: string; name: string };
type DocType = "document" | "folder" | "mindmap" | "gantt" | "spreadsheet";
type DocumentItem = {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  type: DocType;
  title: string;
  plain_text: string;
  content: Record<string, unknown>;
  version: number;
  updated_at: string;
  access_role?: string;
};
type Screen = "home" | "space" | "shared" | "profile" | "document" | "mindmap";
type AuthMode = "login" | "register";
type Notice = { tone: "success" | "error" | "info"; text: string } | null;

const demoDocuments: DocumentItem[] = [
  {
    id: "demo-roadmap",
    workspace_id: "demo-space",
    parent_id: null,
    type: "document",
    title: "移动端产品规划",
    plain_text: "目标、范围与本周待办",
    content: {},
    version: 1,
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-map",
    workspace_id: "demo-space",
    parent_id: null,
    type: "mindmap",
    title: "知识工作台架构",
    plain_text: "文档、思维导图与智能体",
    content: {},
    version: 1,
    updated_at: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: "demo-sheet",
    workspace_id: "demo-space",
    parent_id: null,
    type: "spreadsheet",
    title: "迭代排期表",
    plain_text: "12 行 · 8 列",
    content: {},
    version: 1,
    updated_at: new Date(Date.now() - 86_400_000).toISOString(),
  },
];

const typeMeta: Record<DocType, { label: string; color: string; icon: typeof FileTextIcon }> = {
  document: { label: "文档", color: "blue", icon: FileTextIcon },
  folder: { label: "文件夹", color: "slate", icon: FileIcon },
  mindmap: { label: "思维导图", color: "violet", icon: ReaderIcon },
  gantt: { label: "甘特图", color: "coral", icon: RowsIcon },
  spreadsheet: { label: "电子表格", color: "green", icon: TableIcon },
};

function getToken() {
  return window.localStorage.getItem("kw_mobile_token");
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401) {
    window.localStorage.removeItem("kw_mobile_token");
    window.dispatchEvent(new CustomEvent("kw-auth-expired"));
    throw new Error("登录状态已过期，请重新登录");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || payload?.detail || "请求失败，请稍后重试");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function toPlainText(content: Record<string, unknown> | undefined) {
  if (!content) return "";
  const lines: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const value = node as { text?: string; content?: unknown[] };
    if (value.text) lines.push(value.text);
    value.content?.forEach(walk);
  };
  walk(content);
  return lines.join(" ").trim();
}

function makeContent(text: string) {
  return {
    type: "doc",
    content: text.split(/\n+/).map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <img src="/brand/knowledge-workspace-mark.png" alt="KW" draggable={false} />
      {!compact ? (
        <div>
          <strong>KW</strong>
          <span>Knowledge Workspace</span>
        </div>
      ) : null}
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User, preview?: boolean) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [target, setTarget] = useState(50);
  const [slider, setSlider] = useState(0);
  const [captchaTicket, setCaptchaTicket] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const keyboard = useKeyboard();

  const loadChallenge = useCallback(async () => {
    try {
      const result = await api<{ challenge_token: string; target: number }>("/auth/captcha/challenge");
      setChallengeToken(result.challenge_token);
      setTarget(result.target);
      setSlider(0);
      setCaptchaTicket("");
      setNotice(null);
    } catch {
      setNotice({ tone: "error", text: "本地服务暂未连接，请确认后端已启动" });
    }
  }, []);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  const verifySlider = async () => {
    if (!challengeToken || captchaTicket) return;
    try {
      const result = await api<{ captcha_ticket: string }>("/auth/captcha/verify", {
        method: "POST",
        body: JSON.stringify({ challenge_token: challengeToken, answer: slider }),
      });
      setCaptchaTicket(result.captcha_ticket);
      setNotice({ tone: "success", text: "验证完成" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "验证失败" });
      void loadChallenge();
    }
  };

  const submit = async () => {
    keyboard.hide();
    if (!email || password.length < 8) {
      setNotice({ tone: "error", text: "请填写邮箱和至少 8 位密码" });
      return;
    }
    if (!captchaTicket) {
      setNotice({ tone: "error", text: "请先完成滑块验证" });
      return;
    }
    if (mode === "register" && (!name || !inviteCode)) {
      setNotice({ tone: "error", text: "请填写昵称和邀请码" });
      return;
    }
    setLoading(true);
    try {
      const payload = mode === "login"
        ? { email, password, captcha_ticket: captchaTicket }
        : {
            email,
            display_name: name,
            password,
            invite_code: inviteCode,
            captcha_ticket: captchaTicket,
          };
      const result = await api<{ access_token: string; user: User }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      window.localStorage.setItem("kw_mobile_token", result.access_token);
      onAuthenticated(result.user);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "登录失败" });
      void loadChallenge();
    } finally {
      setLoading(false);
    }
  };

  const localPreview = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  return (
    <MobileScroll className="auth-scroll">
      <main className="auth-screen">
        <section className="auth-hero">
          <Brand />
          <div className="auth-orbit" aria-hidden="true"><span /><span /><span /></div>
          <h1>把知识，整理成<br />可持续的工作流</h1>
          <p>文档、思维导图与项目内容，在手机上也能顺畅编辑。</p>
        </section>

        <section className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>登录</button>
            <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>邀请码注册</button>
          </div>

          <button className="wechat-button" onClick={() => setNotice({ tone: "info", text: "微信授权将在小程序环境启用，本地请使用邮箱登录" })}>
            <span className="wechat-mark">微</span> 微信快捷登录
          </button>
          <div className="auth-divider"><span>或使用邮箱</span></div>

          {mode === "register" ? (
            <label className="field"><span>昵称</span><KeyboardInput value={name} onChange={(event) => setName(event.target.value)} placeholder="你的显示名称" /></label>
          ) : null}
          <label className="field"><span>邮箱</span><KeyboardInput value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@example.com" /></label>
          <label className="field"><span>密码</span><KeyboardInput value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="至少 8 位" /></label>
          {mode === "register" ? (
            <label className="field"><span>邀请码</span><KeyboardInput value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="6–10 位邀请码" /></label>
          ) : null}

          <div className={`captcha ${captchaTicket ? "verified" : ""}`}>
            <div className="captcha-copy">
              <span>{captchaTicket ? <CheckCircledIcon /> : <LockClosedIcon />}</span>
              <div><strong>{captchaTicket ? "验证完成" : "安全验证"}</strong><small>{captchaTicket ? "可以继续提交" : "拖动滑块到标记位置"}</small></div>
            </div>
            {!captchaTicket ? (
              <div className="slider-wrap">
                <span className="slider-target" style={{ left: `${target}%` }} />
                <input aria-label="滑块验证" type="range" min="0" max="100" value={slider} onChange={(event) => setSlider(Number(event.target.value))} onPointerUp={verifySlider} onKeyUp={verifySlider} />
              </div>
            ) : null}
          </div>

          {notice ? <div className={`inline-notice ${notice.tone}`}>{notice.text}</div> : null}
          <button className="primary-button" disabled={loading} onClick={submit}>{loading ? <span className="spinner" /> : null}{mode === "login" ? "登录工作台" : "创建专属空间"}</button>
          {localPreview ? <button className="preview-link" onClick={() => onAuthenticated({ id: "preview-user", public_id: "darrichan", email: "preview@local", display_name: "darrichan" }, true)}>先查看移动端设计</button> : null}
          <p className="privacy-note">继续即表示你同意仅在自己的私有工作区使用服务。</p>
        </section>
      </main>
    </MobileScroll>
  );
}

function TopBar({ title, subtitle, onSearch }: { title: string; subtitle?: string; onSearch?: () => void }) {
  return (
    <header className="app-topbar">
      <div className="topbar-title"><strong>{title}</strong>{subtitle ? <span>{subtitle}</span> : null}</div>
      <button className="icon-button" aria-label="搜索" onClick={onSearch}><MagnifyingGlassIcon /></button>
      <button className="avatar-button" aria-label="个人中心">D</button>
    </header>
  );
}

function BottomNav({ screen, onChange }: { screen: Screen; onChange: (screen: Screen) => void }) {
  const tabs: Array<{ id: Screen; label: string; icon: typeof HomeIcon }> = [
    { id: "home", label: "首页", icon: HomeIcon },
    { id: "space", label: "空间", icon: LayersIcon },
    { id: "shared", label: "共享", icon: Share2Icon },
    { id: "profile", label: "我的", icon: PersonIcon },
  ];
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = screen === tab.id || ((screen === "document" || screen === "mindmap") && tab.id === "space");
        return <button key={tab.id} className={active ? "active" : ""} onClick={() => onChange(tab.id)}><Icon /><span>{tab.label}</span></button>;
      })}
    </nav>
  );
}

function ContentIcon({ type, size = "normal" }: { type: DocType; size?: "small" | "normal" }) {
  const meta = typeMeta[type];
  const Icon = meta.icon;
  return <span className={`content-icon ${meta.color} ${size}`}><Icon /></span>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><span><ReaderIcon /></span><strong>{title}</strong><p>{description}</p></div>;
}

function HomeScreen({ documents, onOpen, onCreate, user }: { documents: DocumentItem[]; onOpen: (doc: DocumentItem) => void; onCreate: () => void; user: User }) {
  const recent = documents.slice(0, 5);
  return (
    <div className="app-layout">
      <TopBar title={`你好，${user.display_name}`} subtitle="继续今天的知识工作" />
      <MobileScroll className="app-scroll">
        <main className="home-content screen-pad">
          <section className="focus-card">
            <div><span className="eyebrow">今日工作台</span><h2>把新想法<br />快速沉淀下来</h2><p>从一个内容节点开始，随时连接更多知识。</p></div>
            <button onClick={onCreate}><PlusIcon /> 新建内容</button>
            <div className="focus-glow" aria-hidden="true" />
          </section>

          <div className="section-heading"><div><h3>快捷开始</h3><span>选择最适合的内容类型</span></div></div>
          <Carousel ariaLabel="快捷创建" className="quick-carousel" contentClassName="quick-track">
            {(["document", "mindmap", "spreadsheet", "gantt"] as DocType[]).map((type) => (
              <button className="quick-card" key={type} onClick={onCreate}><ContentIcon type={type} /><strong>新建{typeMeta[type].label}</strong><span>{type === "document" ? "开始记录" : type === "mindmap" ? "梳理想法" : type === "spreadsheet" ? "组织数据" : "安排计划"}</span></button>
            ))}
          </Carousel>

          <div className="section-heading"><div><h3>最近打开</h3><span>{recent.length} 个内容节点</span></div><button>查看全部 <ChevronRightIcon /></button></div>
          <section className="recent-list">
            {recent.map((doc) => <DocumentRow key={doc.id} doc={doc} onOpen={() => onOpen(doc)} />)}
          </section>
          <div className="home-tip"><CheckCircledIcon /><span>内容会自动保存到你的私有空间</span></div>
        </main>
      </MobileScroll>
    </div>
  );
}

function DocumentRow({ doc, onOpen, selectable, selected, onSelect }: { doc: DocumentItem; onOpen: () => void; selectable?: boolean; selected?: boolean; onSelect?: () => void }) {
  return (
    <button className={`document-row ${selected ? "selected" : ""}`} onClick={selectable ? onSelect : onOpen}>
      {selectable ? <span className={`select-ring ${selected ? "checked" : ""}`}>{selected ? <CheckCircledIcon /> : null}</span> : null}
      <ContentIcon type={doc.type} />
      <span className="document-copy"><strong>{doc.title}</strong><small>{doc.plain_text || `${typeMeta[doc.type].label} · 暂无正文内容`}</small><em><ClockIcon /> {formatRelative(doc.updated_at)}</em></span>
      <ChevronRightIcon className="row-chevron" />
    </button>
  );
}

function SpaceScreen({ documents, onOpen, onCreate }: { documents: DocumentItem[]; onOpen: (doc: DocumentItem) => void; onCreate: () => void }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = documents.filter((doc) => `${doc.title}${doc.plain_text}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="app-layout">
      <TopBar title="我的空间" subtitle={`${documents.length} 个内容节点`} />
      <MobileScroll className="app-scroll">
        <main className="space-content screen-pad">
          <div className="mobile-search"><MagnifyingGlassIcon /><KeyboardInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题和正文" /><MixerHorizontalIcon /></div>
          <div className="space-toolbar"><div className="breadcrumbs"><button>我的文档库</button><ChevronRightIcon /><span>全部内容</span></div><div><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><RowsIcon /></button><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><TableIcon /></button></div></div>
          {selected.length ? <div className="selection-bar"><span>已选择 {selected.length} 项</span><button onClick={() => setSelected([])}>取消</button><button className="danger"><TrashIcon /> 删除</button></div> : null}
          {filtered.length ? (
            <section className={view === "grid" ? "document-grid" : "document-list"}>
              {filtered.map((doc) => view === "list" ? (
                <DocumentRow key={doc.id} doc={doc} onOpen={() => onOpen(doc)} selectable={selected.length > 0} selected={selected.includes(doc.id)} onSelect={() => setSelected((current) => current.includes(doc.id) ? current.filter((id) => id !== doc.id) : [...current, doc.id])} />
              ) : (
                <button className="document-tile" key={doc.id} onClick={() => onOpen(doc)} onContextMenu={(event) => { event.preventDefault(); setSelected([doc.id]); }}><ContentIcon type={doc.type} /><strong>{doc.title}</strong><span>{doc.plain_text || "暂无正文内容"}</span><small>{formatRelative(doc.updated_at)}</small></button>
              ))}
            </section>
          ) : <EmptyState title="没有找到内容" description="换个关键词，或者新建一个内容节点。" />}
          <button className="floating-create" onClick={onCreate}><PlusIcon /><span>新建</span></button>
        </main>
      </MobileScroll>
    </div>
  );
}

function SharedScreen({ documents, onOpen }: { documents: DocumentItem[]; onOpen: (doc: DocumentItem) => void }) {
  const shared = documents.filter((doc) => doc.access_role && doc.access_role !== "owner");
  return (
    <div className="app-layout"><TopBar title="与我共享" subtitle="来自协作者的内容" /><MobileScroll className="app-scroll"><main className="screen-pad shared-content">
      <div className="shared-banner"><Share2Icon /><div><strong>安全协作空间</strong><span>你只能看到被明确分享给你的内容</span></div></div>
      {shared.length ? shared.map((doc) => <DocumentRow key={doc.id} doc={doc} onOpen={() => onOpen(doc)} />) : <EmptyState title="暂无共享内容" description="当协作者向你分享文档时，会显示在这里。" />}
    </main></MobileScroll></div>
  );
}

function ProfileScreen({ user, online, onLogout }: { user: User; online: boolean; onLogout: () => void }) {
  return (
    <div className="app-layout"><TopBar title="我的" subtitle="账号与工作区设置" /><MobileScroll className="app-scroll"><main className="screen-pad profile-content">
      <section className="profile-card"><span className="profile-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span><div><strong>{user.display_name}</strong><span>{user.email}</span><small>{online ? "本地服务已连接" : "当前为本地设计预览"}</small></div></section>
      <section className="setting-list">
        <button><PersonIcon /><span><strong>个人资料</strong><small>昵称、用户名 ID</small></span><ChevronRightIcon /></button>
        <button><GearIcon /><span><strong>工作区外观</strong><small>主题色、字体大小、毛玻璃</small></span><ChevronRightIcon /></button>
        <button><CounterClockwiseClockIcon /><span><strong>编辑历史</strong><small>查看与管理全部版本</small></span><ChevronRightIcon /></button>
        <button><LockClosedIcon /><span><strong>隐私与安全</strong><small>登录设备、邀请码</small></span><ChevronRightIcon /></button>
      </section>
      <button className="logout-button" onClick={onLogout}>退出登录</button>
    </main></MobileScroll></div>
  );
}

function DocumentScreen({ doc, onBack, onOpenMindMap, onSaved }: { doc: DocumentItem; onBack: () => void; onOpenMindMap: () => void; onSaved: (doc: DocumentItem) => void }) {
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.plain_text || toPlainText(doc.content));
  const [status, setStatus] = useState("已保存");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [plusVisible, setPlusVisible] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const keyboard = useKeyboard();

  useEffect(() => {
    if (title === doc.title && body === (doc.plain_text || toPlainText(doc.content))) return;
    setStatus("正在编辑");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (doc.id.startsWith("demo-")) { setStatus("已保存到预览"); return; }
      try {
        const updated = await api<DocumentItem>(`/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ base_version: doc.version, title, content: makeContent(body), reason: "interval" }) });
        onSaved(updated);
        setStatus("已自动保存");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "保存失败");
      }
    }, 1200);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [title, body]);

  return (
    <div className="editor-layout">
      <header className="editor-header"><button className="icon-button" onClick={() => { keyboard.hide(); onBack(); }}><ArrowLeftIcon /></button><div><strong>{title || "无标题文档"}</strong><span>{status}</span></div><button className="text-button">分享</button><button className="icon-button"><DotsHorizontalIcon /></button></header>
      <MobileScroll className="editor-scroll">
        <main className="document-editor">
          <div className="document-meta"><ContentIcon type="document" size="small" /><span>DOC / {doc.id.slice(0, 4).toUpperCase()}</span><em>版本 {doc.version}</em></div>
          <KeyboardInput className="document-title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="无标题文档" />
          <div className="editor-body-wrap" onPointerMove={() => setPlusVisible(true)} onPointerLeave={() => { if (!toolsOpen) setPlusVisible(false); }}>
            {plusVisible ? <button className="block-plus" onClick={() => setToolsOpen((open) => !open)} aria-label="打开编辑工具"><PlusIcon /></button> : null}
            <KeyboardTextarea className="document-body-input" value={body} onChange={(event) => setBody(event.target.value)} placeholder="输入 / 唤起更多内容，或从这里开始写作…" />
          </div>
          <button className="mindmap-preview" onClick={onOpenMindMap}><div className="mindmap-preview-head"><ContentIcon type="mindmap" size="small" /><span><strong>产品架构思维导图</strong><small>4 个主题 · 点击进入编辑</small></span><ChevronRightIcon /></div><div className="mini-map"><span className="mini-root">知识工作台</span><i /><div><span>内容系统</span><span>协作能力</span><span>智能体</span></div></div></button>
          <div className="editor-spacer" />
        </main>
      </MobileScroll>
      {toolsOpen ? <div className="floating-editor-tools"><button><strong>H</strong><span>标题</span></button><button><strong>B</strong><span>加粗</span></button><button><span className="color-dot" /> <span>颜色</span></button><button><TableIcon /><span>表格</span></button><button onClick={onOpenMindMap}><ReaderIcon /><span>导图</span></button><button><FilePlusIcon /><span>插入</span></button></div> : null}
    </div>
  );
}

type MapNode = { id: string; label: string; color: string };

function MindMapScreen({ doc, onBack }: { doc: DocumentItem; onBack: () => void }) {
  const [root, setRoot] = useState(doc.title || "无标题思维导图");
  const [nodes, setNodes] = useState<MapNode[]>([
    { id: "n1", label: "内容系统", color: "blue" },
    { id: "n2", label: "协作能力", color: "coral" },
    { id: "n3", label: "智能体", color: "green" },
    { id: "n4", label: "发布计划", color: "violet" },
  ]);
  const [selected, setSelected] = useState("n1");
  const [status, setStatus] = useState("已保存");
  const saveTimer = useRef<number | null>(null);
  const keyboard = useKeyboard();

  useEffect(() => {
    setStatus("正在自动保存");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setStatus("已自动保存"), 900);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [root, nodes]);

  const addNode = () => {
    const palette = ["blue", "coral", "green", "violet", "amber"];
    const node = { id: `node-${Date.now()}`, label: "新主题", color: palette[nodes.length % palette.length] };
    setNodes((current) => [...current, node]);
    setSelected(node.id);
  };

  return (
    <div className="map-layout">
      <header className="map-header"><button className="icon-button" onClick={() => { keyboard.hide(); onBack(); }}><ArrowLeftIcon /></button><div><strong>{root}</strong><span>{status}</span></div><button className="text-button">分享</button><button className="icon-button"><DotsHorizontalIcon /></button></header>
      <div className="map-toolbar"><button><CounterClockwiseClockIcon /></button><button><Pencil1Icon /></button><button><MixerHorizontalIcon /></button><span /><button onClick={addNode}><PlusIcon /> 主题</button></div>
      <MobileScroll className="map-scroll">
        <main className="map-canvas">
          <div className="canvas-dots" />
          <div className="map-tree">
            <div className="map-root-node"><KeyboardTextarea value={root} onChange={(event) => setRoot(event.target.value)} /></div>
            <div className="map-trunk" />
            <div className="map-branches">
              {nodes.map((node) => <div className={`map-branch ${node.color}`} key={node.id}><i /><button className={selected === node.id ? "selected" : ""} onClick={() => setSelected(node.id)}><KeyboardInput value={node.label} onChange={(event) => setNodes((current) => current.map((item) => item.id === node.id ? { ...item, label: event.target.value } : item))} onFocus={() => setSelected(node.id)} /></button><span className="branch-tail" /></div>)}
            </div>
          </div>
        </main>
      </MobileScroll>
      <div className="map-bottom-tools"><button onClick={addNode}><PlusIcon /><span>同级主题</span></button><button onClick={addNode}><LayersIcon /><span>子主题</span></button><button><ReaderIcon /><span>结构</span></button><button><GearIcon /><span>样式</span></button></div>
    </div>
  );
}

function CreateSheet({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (type: DocType) => void }) {
  const options: Array<{ type: DocType; title: string; description: string }> = [
    { type: "document", title: "文档", description: "写作、记录与整理" },
    { type: "mindmap", title: "思维导图", description: "梳理主题和分支" },
    { type: "spreadsheet", title: "电子表格", description: "管理结构化数据" },
    { type: "gantt", title: "甘特图", description: "安排任务与进度" },
    { type: "folder", title: "文件夹", description: "组织工作区内容" },
  ];
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="新建内容" description="所有内容都会保存到你的私有空间" snap={0.58}>
      <div className="create-grid">{options.map((option) => <button key={option.type} onClick={() => onCreate(option.type)}><ContentIcon type={option.type} /><span><strong>{option.title}</strong><small>{option.description}</small></span><ChevronRightIcon /></button>)}</div>
    </BottomSheet>
  );
}

export default function Prototype() {
  const keyboard = useKeyboard();
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>(demoDocuments);
  const [screen, setScreen] = useState<Screen>("home");
  const [activeDocument, setActiveDocument] = useState<DocumentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const previewRef = useRef(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      let spaces = await api<Workspace[]>("/workspaces");
      if (!spaces.length) spaces = [await api<Workspace>("/workspaces", { method: "POST", body: JSON.stringify({ name: "我的空间" }) })];
      const current = spaces[0];
      setWorkspace(current);
      const docs = await api<DocumentItem[]>(`/workspaces/${current.id}/documents`);
      setDocuments(docs);
      setOnline(true);
    } catch (error) {
      setOnline(false);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "内容加载失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const expired = () => { setUser(null); setScreen("home"); setNotice({ tone: "info", text: "登录状态已过期" }); };
    window.addEventListener("kw-auth-expired", expired);
    const token = getToken();
    if (token) api<User>("/auth/me").then((current) => { setUser(current); void loadWorkspace(); }).catch(() => setUser(null));
    return () => window.removeEventListener("kw-auth-expired", expired);
  }, [loadWorkspace]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const authenticated = (currentUser: User, preview = false) => {
    keyboard.hide();
    previewRef.current = preview;
    setUser(currentUser);
    setScreen("home");
    if (preview) { setOnline(false); setDocuments(demoDocuments); setWorkspace({ id: "demo-space", name: "我的空间" }); }
    else void loadWorkspace();
  };

  const openDocument = (doc: DocumentItem) => {
    if (doc.type === "folder") return;
    setLoading(true);
    window.setTimeout(async () => {
      if (doc.id.startsWith("demo-")) {
        setActiveDocument(doc);
        setScreen(doc.type === "mindmap" ? "mindmap" : "document");
        setLoading(false);
        return;
      }
      try {
        const fresh = await api<DocumentItem>(`/documents/${doc.id}`);
        setActiveDocument(fresh);
        setScreen(fresh.type === "mindmap" ? "mindmap" : "document");
      } catch (error) {
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "文档加载失败" });
      } finally { setLoading(false); }
    }, 220);
  };

  const createDocument = async (type: DocType) => {
    if (!workspace) return;
    setCreateOpen(false);
    setLoading(true);
    const titleMap: Record<DocType, string> = { document: "无标题文档", mindmap: "无标题思维导图", spreadsheet: "无标题表格", gantt: "无标题甘特图", folder: "新建文件夹" };
    try {
      const created = previewRef.current
        ? { ...demoDocuments[0], id: `demo-${Date.now()}`, workspace_id: workspace.id, type, title: titleMap[type], plain_text: "刚刚创建", updated_at: new Date().toISOString() }
        : await api<DocumentItem>("/documents", { method: "POST", body: JSON.stringify({ workspace_id: workspace.id, type, title: titleMap[type] }) });
      setDocuments((current) => [created, ...current]);
      if (type === "folder") { setScreen("space"); setNotice({ tone: "success", text: "文件夹已创建" }); }
      else openDocument(created);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "创建失败" });
    } finally { setLoading(false); }
  };

  const changeScreen = (next: Screen) => {
    setActiveDocument(null);
    setScreen(next);
  };

  const currentMain = useMemo(() => {
    if (!user) return null;
    if (screen === "document" && activeDocument) return <DocumentScreen doc={activeDocument} onBack={() => setScreen("space")} onOpenMindMap={() => setScreen("mindmap")} onSaved={(updated) => { setActiveDocument(updated); setDocuments((current) => current.map((doc) => doc.id === updated.id ? updated : doc)); }} />;
    if (screen === "mindmap" && activeDocument) return <MindMapScreen doc={activeDocument} onBack={() => setScreen(activeDocument.type === "mindmap" ? "space" : "document")} />;
    if (screen === "space") return <SpaceScreen documents={documents} onOpen={openDocument} onCreate={() => setCreateOpen(true)} />;
    if (screen === "shared") return <SharedScreen documents={documents} onOpen={openDocument} />;
    if (screen === "profile") return <ProfileScreen user={user} online={online} onLogout={() => { window.localStorage.removeItem("kw_mobile_token"); setUser(null); setWorkspace(null); setDocuments(demoDocuments); }} />;
    return <HomeScreen documents={documents} onOpen={openDocument} onCreate={() => setCreateOpen(true)} user={user} />;
  }, [user, screen, activeDocument, documents, online, workspace]);

  if (!user) return <AuthScreen onAuthenticated={authenticated} />;

  const editorScreen = screen === "document" || screen === "mindmap";
  return (
    <div className="prototype-shell">
      {currentMain}
      {!editorScreen ? <BottomNav screen={screen} onChange={changeScreen} /> : null}
      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} onCreate={createDocument} />
      {loading ? <div className="app-loading"><span className="spinner" /><strong>正在加载内容</strong></div> : null}
      {notice ? <div className={`toast ${notice.tone}`}>{notice.text}</div> : null}
    </div>
  );
}

function formatRelative(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return "刚刚";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return `${Math.floor(delta / 86_400_000)} 天前`;
}
