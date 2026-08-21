import { CardMarketDetailClient } from "./card-market-detail-client";

export default async function CardMarketDetailPage({
  params,
}: {
  params: Promise<{ card_key: string }>;
}) {
  const { card_key } = await params;

  return <CardMarketDetailClient cardKey={card_key} />;
}
