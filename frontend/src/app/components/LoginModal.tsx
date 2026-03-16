'use client';

import { useEffect, useState } from 'react';

interface LoginModalProps {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, emailCode: string, nickname?: string) => Promise<void>;
  onSendCode: (email: string) => Promise<void>;
  onGithub: () => void;
}

type Mode = 'login' | 'register';

export default function LoginModal({
  open,
  loading = false,
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  if (!open) return null;

  const sendCode = async () => {
    setError(null);
    if (!email) {
      setError('请先输入邮箱');
      return;
    }
    setSendingCode(true);
    try {
      await onSendCode(email);
      setCountdown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证码发送失败');
    } finally {
      setSendingCode(false);
    }
  };

  const submit = async () => {
    setError(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="cg-modal w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">登录 Cyber Guide</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === 'login' ? 'bg-white text-slate-800 shadow' : 'text-slate-500'}`}
              onClick={() => setMode('login')}
            >
              登录
            </button>
            <button
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === 'register' ? 'bg-white text-slate-800 shadow' : 'text-slate-500'}`}
              onClick={() => setMode('register')}
            >
              注册
            </button>
          </div>

          {mode === 'login' && (
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="邮箱"
              type="email"
            />
          )}
          {mode === 'register' && (
            <>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="昵称（可选）"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="邮箱"
                type="email"
              />
              <div className="flex gap-2">
                <input
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="邮箱验证码"
                />
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={sendingCode || countdown > 0}
                  className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                >
                  {sendingCode ? '发送中...' : countdown > 0 ? `${countdown}s` : '发送验证码'}
                </button>
              </div>
            </>
          )}
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="密码（至少 6 位）"
            type="password"
          />
          {mode === 'register' && (
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="确认密码"
              type="password"
            />
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button
            disabled={
              loading ||
              !email ||
              password.length < 6 ||
              (mode === 'register' && (emailCode.trim().length < 4 || confirmPassword.length < 6))
            }
            onClick={submit}
            className="w-full rounded-lg bg-gradient-to-r from-sky-500 via-cyan-500 to-sky-600 px-3 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-50"
          >
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>

          <button
            onClick={onGithub}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            使用 GitHub 登录
          </button>
        </div>
      </div>
    </div>
  );
}
