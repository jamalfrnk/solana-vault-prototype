import { VaultDetail } from "../../../components/VaultDetail";

export default async function VaultPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  return (
    <main>
      <VaultDetail mintInput={mint} />
    </main>
  );
}
