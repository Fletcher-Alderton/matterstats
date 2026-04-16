export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[#e0e0e0] pt-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#1a1a1a] md:text-xl">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-[#999]">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
