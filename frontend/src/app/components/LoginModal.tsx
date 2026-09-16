'use client';

import React, { useEffect, useRef, useState } from 'react';

interface LoginModalProps {
  open: boolean;
  loading?: boolean;
  /**
   * Whether the backend enforces an email verification code. When false the
   * whole code block is hidden — asking for a code the server never issues is
   * what made registration look broken.
   */
  emailCodeRequired?: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, emailCode: string, nickname?: string) => Promise<void>;
  onSendCode: (email: string) => Promise<{ sent: boolean; cooldownSeconds: number } | void>;
  onGithub: () => void;
}

type Mode = 'login' | 'register';

export default function LoginModal({
  open,
  loading = false,
  emailCodeRequired = true,
  onClose,
  onLogin,
  onRegister,
  onSendCode,
  onGithub,
}: LoginModalProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const panelRef = useRef<HTMLDivElement>(null);

  /** Focusable controls inside the dialog, in tab order, skipping disabled ones. */
  const focusablesInPanel = (): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    const selector = 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';
    return Array.from(panel.querySelectorAll<HTMLElement>(selector))
      .filter((el) => !el.hasAttribute('disabled'));
  };

  // Opening the dialog used to leave focus wherever it was on the page behind it.
  useEffect(() => {
    if (!open) return;
    const firstField = panelRef.current?.querySelector<HTMLElement>('input');
    (firstField ?? focusablesInPanel()[0])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Without a trap, Tab walks straight out of the dialog into the page
      // underneath the overlay, which is unreachable by mouse but not by keyboard.
      const items = focusablesInPanel();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active ? panelRef.current?.contains(active) : false;

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const sendCode = async () => {
    setError(null);
    setNotice(null);
    if (!email) {
      setError('请先输入邮箱');
      return;
    }
    setSendingCode(true);
    try {
      const outcome = await onSendCode(email);
      // The server tells us whether a mail actually left. Under dev-log-only
      // the code is valid but only reaches the server log, so do not send the
      // user off to check an inbox that will stay empty.
      if (outcome && outcome.sent === false) {
        setNotice('当前环境未实际发送邮件，验证码只记录在服务端日志中，请联系管理员获取。');
      } else {
        setNotice('验证码已发送，请查收邮箱。');
      }
      setCountdown(outcome && typeof outcome.cooldownSeconds === 'number' ? outcome.cooldownSeconds : 60);
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证码发送失败');
    } finally {
      setSendingCode(false);
    }
  };

  const submit = async () => {
    setError(null);
    setNotice(null);
    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致');
          return;
        }
        await onRegister(email, password, emailCode, nickname || undefined);
      }
      onClose();
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setNickname('');
      setEmailCode('');
      setCountdown(0);
      setNotice(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  };

  return (
    <div
      className="modal-mask-enter fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="登录或注册"
      onClick={onClose}
    >
      <div ref={panelRef} className="modal-panel-enter cg-modal w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">登录 Cyber Guide</h3>
          <button aria-label="关闭" onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            <button
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === 'login' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow' : 'text-slate-500 dark:text-slate-400'}`}
              onClick={() => setMode('login')}
            >
              登录
            </button>
            <button
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === 'register' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow' : 'text-slate-500 dark:text-slate-400'}`}
              onClick={() => setMode('register')}
            >
              注册
            </button>
          </div>

          {mode === 'login' && (
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="邮箱" aria-label="邮箱"
              type="email"
            />
          )}
          {mode === 'register' && (
            <>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="昵称（可选）" aria-label="昵称（可选）"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="邮箱" aria-label="邮箱"
                type="email"
              />
              {emailCodeRequired && (
                <div className="flex gap-2">
                  <input
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    placeholder="邮箱验证码" aria-label="邮箱验证码"
                  />
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={sendingCode || countdown > 0}
                    className="shrink-0 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/45 px-3 py-2 text-xs text-sky-700 dark:text-sky-100 hover:bg-sky-100 dark:hover:bg-sky-900/70 disabled:opacity-50"
                  >
                    {sendingCode ? '发送中...' : countdown > 0 ? `${countdown}s` : '发送验证码'}
                  </button>
                </div>
              )}
            </>
          )}
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="密码（至少 6 位）" aria-label="密码（至少 6 位）"
            type="password"
          />
          {mode === 'register' && (
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="确认密码" aria-label="确认密码"
              type="password"
            />
          )}

          {notice && <p role="status" aria-live="polite" className="text-sm text-sky-700 dark:text-sky-300">{notice}</p>}
          {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}

          <button
            disabled={
              loading ||
              !email ||
              password.length < 6 ||
              (mode === 'register' && confirmPassword.length < 6)
            }
            onClick={submit}
            className="w-full rounded-lg bg-gradient-to-r from-sky-500 via-cyan-500 to-sky-600 px-3 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-50"
          >
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
          {mode === 'register' && (
            <p className="text-[12px] text-slate-400 dark:text-slate-500">
              {emailCodeRequired
                ? '注册需要邮箱验证码，请先点击「发送验证码」。'
                : '当前环境无需邮箱验证码，填写邮箱和密码即可完成注册。'}
            </p>
          )}

          <button
            onClick={onGithub}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            使用 GitHub 登录
          </button>
        </div>
      </div>
    </div>
  );
}
