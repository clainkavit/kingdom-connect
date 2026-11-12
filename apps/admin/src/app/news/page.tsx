"use client";

import { FeaturedManager } from "@/components/featured";
import { NewsEditor } from "@/components/news-editor";
import { featuredApi } from "@/lib/featured";
import { newsApi } from "@/lib/news";

export default function NewsPage() {
  return (
    <>
      <NewsEditor api={newsApi} />
      <FeaturedManager api={featuredApi} />
    </>
  );
}
