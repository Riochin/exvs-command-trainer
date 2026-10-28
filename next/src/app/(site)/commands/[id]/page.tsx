import { CommandDetailContent } from './CommandDetailContent';

export default async function CommandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CommandDetailContent commandId={id} />;
}
