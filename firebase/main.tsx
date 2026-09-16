import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import NotebookApp from '../app/notebook';
import '../app/globals.css';
import { createFirestoreStorage } from './firebase-storage';
import { firebaseConfig } from './firebase-config';
import type { NotebookStorage } from '../lib/notebook-storage';

declare global {
  interface Window {
    firebase?: any;
  }
}

type Session = {
  user: any;
  storage: NotebookStorage;
};

function LoginCard({
  title,
  detail,
  button,
  onClick,
}: {
  title: string;
  detail: string;
  button?: string;
  onClick?: () => void;
}) {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">CN</div>
        <p className="eyebrow">CELL NOTEBOOK</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        {button && onClick && (
          <button className="primary login-button" onClick={onClick}>
            <span className="google-g">G</span>
            {button}
          </button>
        )}
      </section>
    </main>
  );
}

function FirebaseApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const sdk = window.firebase;
  const config = firebaseConfig;
  const configured = Boolean(
    config.apiKey &&
      config.projectId &&
      config.apiKey !== '请填写' &&
      config.projectId !== '请填写',
  );

  useEffect(() => {
    if (!sdk || !configured) {
      setReady(true);
      return;
    }
    if (!sdk.apps.length) sdk.initializeApp(config);
    const auth = sdk.auth();
    void auth.setPersistence(sdk.auth.Auth.Persistence.LOCAL).catch((e: Error) =>
      setError(e.message),
    );
    return auth.onAuthStateChanged(
      (user: any) => {
        setSession(
          user
            ? { user, storage: createFirestoreStorage(sdk.firestore(), user.uid) }
            : null,
        );
        setReady(true);
      },
      (e: Error) => {
        setError(e.message);
        setReady(true);
      },
    );
  }, [configured, config, sdk]);

  if (!sdk)
    return (
      <LoginCard
        title="无法载入登录服务"
        detail="请检查网络连接，并允许浏览器载入 Google Firebase 服务。"
      />
    );
  if (!configured)
    return (
      <LoginCard
        title="还差一步配置"
        detail="请把 Firebase Web 应用配置填入 firebase/firebase-config.ts，然后重新构建发布。"
      />
    );
  if (!ready)
    return <LoginCard title="正在连接…" detail="正在安全读取你的登录状态。" />;
  if (!session)
    return (
      <>
        {error && <div className="auth-error">{error}</div>}
        <LoginCard
          title="你的细胞培养记录"
          detail="登录后，项目和计数会自动保存到你的个人云端，并在电脑和手机间同步。"
          button="使用 Google 账号登录"
          onClick={() => {
            setError('');
            const provider = new sdk.auth.GoogleAuthProvider();
            void sdk.auth().signInWithPopup(provider).catch((e: Error) => {
              setError(e.message);
            });
          }}
        />
      </>
    );

  return (
    <>
      {error && <div className="auth-error">{error}</div>}
      <NotebookApp
        userName={session.user.displayName || session.user.email || 'Google 用户'}
        storage={session.storage}
        onSignOut={() => sdk.auth().signOut()}
        googleDriveEnabled={false}
      />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<FirebaseApp />);

