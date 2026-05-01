import { PracticePageContent } from './PracticePageContent';

export default async function PracticePage({
  params,
}: {
  params: Promise<{ commandId: string }>;
}) {
  const { commandId } = await params;
  return <PracticePageContent commandId={commandId} />;
}
