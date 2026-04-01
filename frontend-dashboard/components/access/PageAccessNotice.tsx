import Link from "next/link";

type PageAccessNoticeProps = {
  title: string;
  description: string;
  href?: string;
  ctaLabel?: string;
};

export default function PageAccessNotice({
  title,
  description,
  href,
  ctaLabel,
}: PageAccessNoticeProps) {
  return (
    <section className="mx-auto max-w-3xl rounded-[1.9rem] border border-border-main bg-[linear-gradient(180deg,rgba(16,185,129,0.06),rgba(255,255,255,0.98))] p-8 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
        Access Restricted
      </div>
      <h1 className="mt-3 text-[1.75rem] font-black tracking-[-0.03em] text-text-main">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">{description}</p>
      {href && ctaLabel ? (
        <div className="mt-6">
          <Link
            href={href}
            className="inline-flex items-center rounded-xl border border-primary bg-primary px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:opacity-90"
          >
            {ctaLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
