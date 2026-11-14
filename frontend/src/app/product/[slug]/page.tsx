import type { Metadata } from "next";
import { Suspense } from "react";
import ProductRoute from "@/components/ProductRoute";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Product | Only For Her" };

async function Product({ params }: Props) {
  const { slug } = await params;
  return <ProductRoute slug={slug} />;
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<main id="main" className="page-white" aria-busy="true" />}>
      <Product params={params} />
    </Suspense>
  );
}
