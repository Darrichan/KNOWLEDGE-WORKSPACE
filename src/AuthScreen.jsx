import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle, EnvelopeSimple, QrCode, SpinnerGap, WechatLogo } from "@phosphor-icons/react";
import { api } from "./api.js";
import { SliderCaptcha } from "./SliderCaptcha.jsx";

export function AuthScreen({ onAuthenticate, onWechatAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [method, setMethod] = useState("email");
  const [form, setForm] = useState({ email: "", display_name: "", public_id: "", password: "", invite_code: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [wechat, setWechat] = useState({ loading: true, configured: false });
  const [qrRequest, setQrRequest] = useState(0);
  const [qrState, setQrState] = useState({ loading: false, error: "", session: null, confirmed: false });

  useEffect(() => {
    api.wechatStatus()
      .then((result) => setWechat({ loading: false, configured: Boolean(result.configured) }))
      .catch(() => setWechat({ loading: false, configured: false }));
  }, []);

  useEffect(() => {
    if (method !== "wechat" || mode !== "login" || !wechat.configured) return undefined;

    let cancelled = false;
    let pollTimer = null;
    const startMiniProgramScan = async () => {
      setQrState({ loading: true, error: "", session: null, confirmed: false });
      try {
        const scanSession = await api.createWechatScanSession();
        if (cancelled) return;
        setQrState({ loading: false, error: "", session: scanSession, confirmed: false });
        const poll = async () => {
          if (cancelled) return;
          try {
            const result = await api.pollWechatScanSession(scanSession.ticket, scanSession.poll_token);
            if (cancelled) return;
            if (result.status === "confirmed" && result.user) {
              setQrState({ loading: false, error: "", session: scanSession, confirmed: true });
              await onWechatAuthenticated(result.user);
              return;
            }
            if (result.status === "expired") {
              setQrState({ loading: false, error: "二维码已过期，请刷新后重试", session: null, confirmed: false });
              return;
            }
            if (result.status === "consumed") {
              setQrState({ loading: false, error: "二维码已经使用，请重新生成", session: null, confirmed: false });
              return;
            }
            pollTimer = window.setTimeout(poll, 1500);
          } catch (pollError) {
            if (!cancelled) setQrState({ loading: false, error: pollError.message || "登录状态检查失败，请重试", session: null, confirmed: false });
          }
        };
        pollTimer = window.setTimeout(poll, 1200);
      } catch (qrError) {
        if (!cancelled) setQrState({ loading: false, error: qrError.message || "小程序码生成失败，请稍后重试", session: null, confirmed: false });
      }
    };
    startMiniProgramScan();
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [method, mode, qrRequest, wechat.configured, onWechatAuthenticated]);

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

  const requestWechatQr = () => {
    setError("");
    if (!wechat.configured) {
      setError("微信小程序参数尚未配置，请先使用邮箱登录");
      return;
    }
    setQrRequest((value) => value + 1);
  };

  const switchMode = () => {
    setMode((current) => current === "login" ? "register" : "login");
    setMethod("email");
    setQrRequest(0);
    setQrState({ loading: false, error: "", session: null, confirmed: false });
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
              <div className="auth-qr-stage">
                {qrState.session?.qr_code_data_url && !qrState.confirmed ? <img className="auth-qr-mount auth-mini-program-code" src={qrState.session.qr_code_data_url} alt="KW 小程序登录码" /> : null}
                {wechat.loading || qrState.loading ? <div className="auth-qr-state"><SpinnerGap className="is-spinning" /><strong>正在生成二维码</strong></div> : null}
                {!wechat.loading && !wechat.configured ? <div className="auth-qr-state"><QrCode /><strong>微信小程序登录尚未配置</strong><small>请先使用邮箱方式登录</small></div> : null}
                {mode === "register" && wechat.configured ? <div className="auth-qr-state"><QrCode /><strong>请先使用邀请码创建账户</strong><small>注册后在小程序“我的”页面绑定微信，即可扫码登录 PC</small></div> : null}
                {qrState.error ? <div className="auth-qr-state is-error"><QrCode /><strong>{qrState.error}</strong><button type="button" onClick={requestWechatQr}>重新加载</button></div> : null}
                {qrState.confirmed ? <div className="auth-qr-state is-success"><CheckCircle weight="fill" /><strong>手机已确认</strong><small>正在进入工作空间…</small></div> : null}
              </div>
              {error && <div className="auth-error">{error}</div>}
              <p className="auth-qr-help">{mode === "login" ? "微信扫一扫将直接打开 KW 小程序，确认后当前电脑会自动登录。" : "为了保持邀请制，请先使用邀请码创建账户，再在小程序里绑定微信。"}</p>
              {mode === "login" ? (
                <button className="auth-wechat-fallback" type="button" disabled={wechat.loading || !wechat.configured || qrState.loading} onClick={requestWechatQr}>刷新小程序码</button>
              ) : (
                <button className="auth-wechat-fallback" type="button" onClick={() => setMethod("email")}>使用邀请码注册</button>
              )}
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
