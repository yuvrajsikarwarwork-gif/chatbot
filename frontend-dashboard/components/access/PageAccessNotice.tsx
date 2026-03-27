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
    <section className="mx-auto max-w-3xl rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-8 shadow-[var(--shadow-glass)] backdrop-blur-2xl">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
        Access Restricted
      </div>
      <h1 className="mt-3 bg-[linear-gradient(180deg,var(--text),color-mix(in_srgb,var(--text)_72%,var(--accent)_28%))] bg-clip-text text-[1.75rem] font-black tracking-[-0.03em] text-transparent">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p>
      {href && ctaLabel ? (
        <div className="mt-6">
          <Link
            href={href}
            className="inline-flex items-center rounded-xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white shadow-[0_18px_32px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5"
          >
            {ctaLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
