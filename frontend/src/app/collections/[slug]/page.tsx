import type { Metadata } from "next";
import { Suspense } from "react";
import CollectionRoute from "@/components/CollectionRoute";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Collections | Only For Her" };

async function Collection({ params }: Props) {
  const { slug } = await params;
  return <CollectionRoute slug={slug} type={false} />;
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<main id="main" className="page-white" aria-busy="true" />}>
      <Collection params={params} />
    </Suspense>
  );
}
