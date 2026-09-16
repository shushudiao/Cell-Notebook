import NotebookApp from './notebook';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <NotebookApp userName={user.displayName} />;
}

