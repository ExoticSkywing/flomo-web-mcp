export interface MemoImage {
  index: number;
  url: string;
  alt?: string;
  fileName?: string;
  mimeType?: string;
}

export interface Memo {
  slug: string;
  content: string;
  html?: string;
  tags: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
  images: MemoImage[];
  imageCount: number;
}
