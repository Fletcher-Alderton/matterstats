export interface MatterAuthor {
  object: string;
  id: string;
  name: string;
}

export interface MatterTag {
  object: string;
  id: string;
  name: string;
}

export interface MatterItem {
  object: string;
  id: string;
  title: string;
  url: string;
  site_name: string | null;
  author: MatterAuthor | null;
  status: "inbox" | "queue" | "archive";
  is_favorite: boolean;
  content_type: string;
  word_count: number | null;
  reading_progress: number;
  image_url: string | null;
  excerpt: string | null;
  tags: MatterTag[];
  updated_at: string;
}

export interface MatterSession {
  object: string;
  id: string;
  date: string;
  seconds_read: number;
}
