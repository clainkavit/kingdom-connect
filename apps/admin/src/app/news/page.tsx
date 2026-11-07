"use client";

import { NewsEditor } from "@/components/news-editor";
import { newsApi } from "@/lib/news";

export default function NewsPage() {
  return <NewsEditor api={newsApi} />;
}
