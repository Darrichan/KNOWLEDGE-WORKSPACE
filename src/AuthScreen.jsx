import { useEffect, useRef, useState } from "react";
import { ArrowRight, EnvelopeSimple, QrCode, SpinnerGap, WechatLogo } from "@phosphor-icons/react";
import { api } from "./api.js";
import { SliderCaptcha } from "./SliderCaptcha.jsx";

let wechatLoginScriptPromise;

function loadWechatLoginScript() {
  if (window.WxLogin) return Promise.resolve();
  if (wechatLoginScriptPromise) return wechatLoginScriptPromise;
  wechatLoginScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kw-wechat-login="true"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("微信二维码组件加载失败")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js";
    script.async = true;
    script.dataset.kwWechatLogin = "true";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error("微信二维码组件加载失败")), { once: true });
    document.head.appendChild(script);
  });
  return wechatLoginScriptPromise;
}

export function AuthScreen({ onAuthenticate }) {
  const [mode, setMode] = useState("login");
  const [method, setMethod] = useState("email");
  const [form, setForm] = useState({ email: "", display_name: "", public_id: "", password: "", invite_code: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [wechat, setWechat] = useState({ loading: true, configured: false });
  const [qrRequest, setQrRequest] = useState(0);
  const [qrState, setQrState] = useState({ loading: false, error: "" });
  const qrMountRef = useRef(null);

  useEffect(() => {
    api.wechatStatus()
      .then((result) => setWechat({ loading: false, configured: Boolean(result.configured) }))
      .catch(() => setWechat({ loading: false, configured: false }));
  }, []);

  useEffect(() => {
    if (method !== "wechat" || !wechat.configured) return undefined;
    if (mode === "register" && qrRequest === 0) return undefined;

    let cancelled = false;
    const mountQrCode = async () => {
      setQrState({ loading: true, error: "" });
      try {
        const config = await api.wechatQrConfig({
          inviteCode: mode === "register" ? form.invite_code.trim() : "",
          nextPath: "/",
        });
        if (!config.configured) throw new Error("微信开放平台登录尚未配置");
        await loadWechatLoginScript();
        if (cancelled || !qrMountRef.current) return;
        qrMountRef.current.replaceChildren();
        new window.WxLogin({
          self_redirect: false,
          id: qrMountRef.current.id,
          appid: config.appid,
          scope: config.scope,
          redirect_uri: encodeURIComponent(config.redirect_uri),
          state: config.state,
          style: "black",
        });
        setQrState({ loading: false, error: "" });
      } catch (qrError) {
        if (!cancelled) setQrState({ loading: false, error: qrError.message || "二维码加载失败，请稍后重试" });
      }
    };
    mountQrCode();
    return () => {
      cancelled = true;
      if (qrMountRef.current) qrMountRef.current.replaceChildren();
    };
  }, [method, mode, qrRequest, wechat.configured]);

  const authenticate = async (captchaTicket = null) => {
    setSubmitting(true);
    setError("");
    try {
      await onAuthenticate(mode, {
        ...form,
        ...(captchaTicket ? { captcha_ticket: captchaTicket } : {}),
      });
    } catch (authError) {
      setError(authError.message || "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setCaptchaOpen(true);
  };

  const startWechatLogin = () => {
    if (!wechat.configured) {
      setError("微信开放平台参数尚未配置，请先使用邮箱登录");
      return;
    }
    if (mode === "register" && !form.invite_code.trim()) {
      setError("微信扫码注册前请先填写邀请码");
      return;
    }
    const query = new URLSearchParams({ next_path: "/" });
    if (mode === "register") query.set("invite_code", form.invite_code.trim());
    window.location.assign(`/api/v1/auth/wechat/authorize?${query}`);
  };

  const requestWechatQr = () => {
    setError("");
    if (!wechat.configured) {
      setError("微信开放平台参数尚未配置，请先使用邮箱登录");
      return;
    }
    if (mode === "register" && !form.invite_code.trim()) {
      setError("微信扫码注册前请先填写邀请码");
      return;
    }
    setQrRequest((value) => value + 1);
  };

  const switchMode = () => {
    setMode((current) => current === "login" ? "register" : "login");
    setQrRequest(0);
    setQrState({ loading: false, error: "" });
    setError("");
  };

  return (
    <main className="auth-shell auth-shell-simple">
      <section className="auth-simple-wrap">
        <div className="auth-brand auth-brand-centered"><img className="auth-brand-lockup" src="/brand/knowledge-workspace-lockup.png" alt="Knowledge Workspace" /></div>
        <form className={`auth-card auth-card-simple is-${mode}`} onSubmit={submit}>
          <div className="auth-card-heading">
            <h1>{mode === "login" ? "登录" : "创建账户"}</h1>
            <p>{mode === "login" ? "进入你的知识工作空间" : "创建一个由你掌控的数据空间"}</p>
          </div>
          <div className="auth-method-tabs" role="tablist" aria-label="登录方式">
            <button className={method === "email" ? "is-active" : ""} type="button" role="tab" aria-selected={method === "email"} onClick={() => { setMethod("email"); setError(""); }}>
              <EnvelopeSimple />账号{mode === "login" ? "登录" : "注册"}
            </button>
            <button className={method === "wechat" ? "is-active" : ""} type="button" role="tab" aria-selected={method === "wechat"} onClick={() => { setMethod("wechat"); setError(""); }}>
              <WechatLogo weight="fill" />微信扫码
            </button>
          </div>

          {method === "email" ? (
            <div className="auth-email-fields">
              {mode === "register" && (
                <>
                  <label>姓名<input required maxLength={80} value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="你的名字" /></label>
                  <label>用户名 ID<input required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9-]*" value={form.public_id} onChange={(event) => setForm({ ...form, public_id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="例如 darrichan" /><small>用于公开主页地址 /{form.public_id || "username"}</small></label>
                  <label>邀请码<input required minLength={6} maxLength={128} autoComplete="one-time-code" value={form.invite_code} onChange={(event) => setForm({ ...form, invite_code: event.target.value.trimStart() })} placeholder="请输入管理员提供的邀请码" /><small>当前工作空间仅对受邀用户开放</small></label>
                </>
              )}
              <label>邮箱<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
              <label>密码<input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少 8 位" /></label>
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-submit" disabled={submitting}>
                {submitting ? "正在连接…" : mode === "login" ? "继续" : "创建空间"}<ArrowRight weight="bold" />
              </button>
            </div>
          ) : (
            <div className="auth-wechat-panel">
              {mode === "register" && (
                <label>邀请码<input required minLength={6} maxLength={128} autoComplete="one-time-code" value={form.invite_code} onChange={(event) => { setForm({ ...form, invite_code: event.target.value.trimStart() }); setQrRequest(0); }} placeholder="先填写邀请码，再生成二维码" /><small>扫码注册后会自动创建并绑定当前微信账号</small></label>
              )}
              <div className="auth-qr-stage">
                <div id="kw-wechat-login-qr" className="auth-qr-mount" ref={qrMountRef} />
                {wechat.loading || qrState.loading ? <div className="auth-qr-state"><SpinnerGap className="is-spinning" /><strong>正在生成二维码</strong></div> : null}
                {!wechat.loading && !wechat.configured ? <div className="auth-qr-state"><QrCode /><strong>微信登录尚未配置</strong><small>请先使用邮箱方式登录</small></div> : null}
                {mode === "register" && qrRequest === 0 && wechat.configured ? <div className="auth-qr-state"><QrCode /><strong>填写邀请码后生成二维码</strong><button type="button" onClick={requestWechatQr}>生成注册二维码</button></div> : null}
                {qrState.error ? <div className="auth-qr-state is-error"><QrCode /><strong>{qrState.error}</strong><button type="button" onClick={requestWechatQr}>重新加载</button></div> : null}
              </div>
              {error && <div className="auth-error">{error}</div>}
              <p className="auth-qr-help">请使用微信扫描二维码，确认后将在当前电脑完成{mode === "login" ? "登录" : "注册"}。</p>
              <button className="auth-wechat-fallback" type="button" disabled={wechat.loading || !wechat.configured} onClick={startWechatLogin}>二维码无法显示？打开微信授权页</button>
            </div>
          )}
          <button className="auth-mode-switch" type="button" onClick={switchMode}>
            {mode === "login" ? "没有账户？立即注册" : "已有账户？返回登录"}
          </button>
        </form>
        <p className="auth-footer-note">自托管部署 · 数据保存在你的 PostgreSQL 中</p>
      </section>
      {captchaOpen && (
        <SliderCaptcha
          actionLabel={mode === "login" ? "登录" : "注册"}
          onCancel={() => setCaptchaOpen(false)}
          onVerified={async (ticket) => { setCaptchaOpen(false); await authenticate(ticket); }}
        />
      )}
    </main>
  );
}
