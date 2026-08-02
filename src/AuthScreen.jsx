import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { SliderCaptcha } from "./SliderCaptcha.jsx";

export function AuthScreen({ onAuthenticate }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", display_name: "", public_id: "", password: "", invite_code: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);

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

  return (
    <main className="auth-shell auth-shell-simple">
      <section className="auth-simple-wrap">
        <div className="auth-brand auth-brand-centered"><img className="auth-brand-lockup" src="/brand/knowledge-workspace-lockup.png" alt="Knowledge Workspace" /></div>
        <form className="auth-card auth-card-simple" onSubmit={submit}>
          <div className="auth-card-heading">
            <h1>{mode === "login" ? "登录" : "创建账户"}</h1>
            <p>{mode === "login" ? "进入你的知识工作空间" : "创建一个由你掌控的数据空间"}</p>
          </div>
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
          <button className="auth-mode-switch" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
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
