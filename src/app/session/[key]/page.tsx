import { SessionView } from './session-view';

export default async function SessionPage({ params }: PageProps<'/session/[key]'>) {
  const { key } = await params;
  return <SessionView sessionKey={Number(key)} />;
}
