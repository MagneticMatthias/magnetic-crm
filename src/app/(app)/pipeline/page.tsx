import { redirect } from 'next/navigation';
export default async function Pipeline({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  redirect(p ? `/pipelines?p=${p}` : '/pipelines');
}
