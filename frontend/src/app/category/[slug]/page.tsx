import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import CollectionRoute from "@/components/CollectionRoute";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Shop | Only For Her" };

async function Category({ params }: Props) {
  const { slug } = await params;
  if (slug === "divine") redirect("/collections/divine");
  return <CollectionRoute slug={slug} type />;
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<main id="main" className="page-white" aria-busy="true" />}>
      <Category params={params} />
    </Suspense>
  );
}
