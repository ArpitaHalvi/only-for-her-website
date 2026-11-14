import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import ShopPage from "@/components/ShopPage";

type Props = { params: Promise<{ view: string }> };

const VIEWS = { bestsellers: "bestsellers", "new-arrivals": "new" } as const;

export const metadata: Metadata = { title: "Shop | Only For Her" };

async function Shop({ params }: Props) {
  const { view } = await params;
  if (!(view in VIEWS)) notFound();
  return <ShopPage view={VIEWS[view as keyof typeof VIEWS]} />;
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<main id="main" className="page-white" aria-busy="true" />}>
      <Shop params={params} />
    </Suspense>
  );
}
