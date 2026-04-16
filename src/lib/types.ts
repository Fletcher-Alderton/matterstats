import type { MatterItem } from "@/lib/matter-api";

export interface ProcessedItem {
  id: string;
  title: string;
  url: string | null;
  author: string;
  source: string;
  category: string;
  status: MatterItem["status"];
  progress: number;
  favorite: boolean;
  wordCount: number;
  excerpt: string;
  imageUrl: string;
}

export interface WeekData {
  week: string;
  minutes: number;
  sessions: number;
}

export interface DashboardData {
  total: {
    articles: number;
    sessions: number;
    hoursRead: number;
    favorites: number;
    completed: number;
    weeksTracked: number;
  };
  categories: Record<string, number>;
  weekly: WeekData[];
  sources: Record<string, number>;
  authors: Record<string, number>;
  progress: Record<string, number>;
  favorites: ProcessedItem[];
  items: ProcessedItem[];
}
