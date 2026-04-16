"use client";

import type { DashboardData } from "@/lib/types";

export function FavoritesShowcase({
  favorites,
}: {
  favorites: DashboardData["favorites"];
}) {
  if (favorites.length === 0) return null;

  const [featured, ...rest] = favorites;

  const FeaturedWrapper = featured.url ? "a" : "div";
  const featuredLinkProps = featured.url
    ? {
        href: featured.url,
        target: "_blank" as const,
        rel: "noopener noreferrer",
      }
    : {};

  return (
    <div>
      {/* Featured card */}
      <FeaturedWrapper
        {...featuredLinkProps}
        className="group mb-6 block border-b border-[#e0e0e0] pb-6"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
          {featured.imageUrl && (
            <div className="w-full shrink-0 overflow-hidden bg-[#e8e8e8] md:w-48">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={featured.imageUrl}
                alt=""
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-2 text-lg font-semibold leading-snug text-[#1a1a1a] group-hover:underline md:text-xl">
              {featured.title}
            </div>
            {featured.excerpt && (
              <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-[#999]">
                {featured.excerpt}
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-xs text-[#999]">
              {featured.author && <span>{featured.author}</span>}
              {featured.author && featured.source && <span>·</span>}
              {featured.source && <span>{featured.source}</span>}
              <span>·</span>
              <span className="text-[#999]">{featured.category}</span>
            </div>
          </div>
        </div>
      </FeaturedWrapper>

      {/* Rest in a compact grid */}
      {rest.length > 0 && (
        <div className="flex flex-col">
          {rest.map((f) => {
            const Wrapper = f.url ? "a" : "div";
            const linkProps = f.url
              ? {
                  href: f.url,
                  target: "_blank" as const,
                  rel: "noopener noreferrer",
                }
              : {};
            return (
              <Wrapper
                key={f.id}
                {...linkProps}
                className="group block border-b border-[#e8e8e8] py-5"
              >
                <div className="mb-2 text-sm font-semibold leading-snug text-[#1a1a1a] group-hover:underline">
                  {f.title}
                </div>
                {f.excerpt && (
                  <p className="mb-2 line-clamp-1 text-xs text-[#999]">
                    {f.excerpt}
                  </p>
                )}
                <div className="flex items-center gap-1.5 text-xs text-[#999]">
                  <span>{f.author || f.source}</span>
                  <span>·</span>
                  <span className="text-[#999]">{f.category}</span>
                </div>
              </Wrapper>
            );
          })}
        </div>
      )}
    </div>
  );
}
