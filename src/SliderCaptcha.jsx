import { useEffect, useState } from "react";
import { ArrowClockwise, Check, LockKey, X } from "@phosphor-icons/react";
import { api } from "./api.js";

export function SliderCaptcha({ actionLabel = "继续", onCancel, onVerified }) {
  const [challenge, setChallenge] = useState(null);
  const [value, setValue] = useState(0);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("正在生成安全验证…");

  const loadChallenge = async () => {
    setStatus("loading");
    setValue(0);
    setMessage("正在生成安全验证…");
    try {
      const next = await api.captchaChallenge();
      setChallenge(next);
      setStatus("ready");
      setMessage("拖动滑块，使圆点与标记重合");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "验证加载失败");
    }
  };

  useEffect(() => { loadChallenge(); }, []);

  const verify = async () => {
    if (!challenge || status !== "ready") return;
    setStatus("checking");
    setMessage("正在验证…");
    try {
      const result = await api.verifyCaptcha({
        challenge_token: challenge.challenge_token,
        answer: Number(value),
      });
      setStatus("success");
      setMessage("验证通过");
      window.setTimeout(() => onVerified(result.captcha_ticket), 220);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "位置不正确，请重试");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="captcha-modal" role="dialog" aria-modal="true" aria-labelledby="captcha-title">
        <div className="captcha-heading">
          <span><LockKey weight="fill" /></span>
          <div><h2 id="captcha-title">安全验证</h2><p>完成验证后继续{actionLabel}</p></div>
          <button type="button" onClick={onCancel} aria-label="关闭验证"><X /></button>
        </div>
        <div className={`captcha-stage is-${status}`}>
          <div className="captcha-scale">
            {challenge && <i style={{ left: `${challenge.target}%` }} aria-hidden="true" />}
            <span style={{ left: `${value}%` }}><Check weight="bold" /></span>
          </div>
          <input
            aria-label="拖动滑块完成验证"
            type="range"
            min="0"
            max="100"
            value={value}
            disabled={!challenge || ["loading", "checking", "success"].includes(status)}
            onChange={(event) => { setValue(event.target.value); if (status === "error") setStatus("ready"); }}
          />
          <p>{message}</p>
        </div>
        <div className="captcha-actions">
          <button type="button" className="captcha-refresh" onClick={loadChallenge}><ArrowClockwise /> 换一个</button>
          <button type="button" className="captcha-confirm" disabled={!challenge || status !== "ready"} onClick={verify}>验证</button>
        </div>
      </section>
    </div>
  );
}
