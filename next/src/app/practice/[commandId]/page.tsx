import { PracticePageContent } from './PracticePageContent';

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ commandId: string }>;
  searchParams: Promise<{ timeLimit?: string; relay?: string }>;
}) {
  const { commandId } = await params;
  const { timeLimit, relay } = await searchParams;
  const parsedLimit = timeLimit ? Number(timeLimit) : null;
  return <PracticePageContent commandId={commandId} timeLimit={parsedLimit} relayRoom={relay ?? null} />;
}
