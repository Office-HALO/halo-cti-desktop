import { useState } from 'react';
import HaloLogo from '../components/HaloLogo.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErr('メールアドレスとパスワードを入力してください');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await signIn(email, password);
    } catch {
      setErr('メールアドレスまたはパスワードが正しくありません');
      setBusy(false);
    }
  };

  return (
    <div className="login-root">
      <div className="login-side">
        <div className="login-mark">
          <HaloLogo size={44} withWord />
        </div>
        <div className="login-tag">
          <div className="tag-label">CTI Operator Console</div>
          <div className="tag-body">
            本日も安全な運営を。
            <br />
            すべての通話と予約を、一元管理。
          </div>
        </div>
        <div className="login-status mono">
          <div>
            <span className="dot ok" /> Database · online
          </div>
          <div>
            <span className="dot ok" /> Supabase · 接続済
          </div>
        </div>
        <div className="login-ver mono">v 0.1.0 · HALO CTI Desktop</div>
      </div>

      <div className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <h1>スタッフ ログイン</h1>
          <p className="sub">Supabase Auth に登録されたアカウントでログインしてください。</p>

          <label>
            <span>メールアドレス</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@halo.com"
            />
          </label>
          <label>
            <span>パスワード</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <div className="login-error">{err}</div>

          <button
            className="btn primary"
            type="submit"
            disabled={busy}
            style={{ height: 40, justifyContent: 'center', width: '100%', fontSize: 13 }}
          >
            {busy ? 'ログイン中...' : 'ログイン'}
            {!busy && <Icon name="chevronR" size={14} />}
          </button>

          <div className="login-foot mono">© 2026 HALO · すべての通話は品質向上のため録音されます</div>
        </form>
      </div>
    </div>
  );
}
