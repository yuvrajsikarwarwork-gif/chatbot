import SectionTabs from "../navigation/SectionTabs";

type CampaignHeaderProps = {
  campaignName?: string | null;
  pageTitle: string;
  description: string;
  tabs: Array<{ label: string; href: string }>;
  currentPath: string;
};

export const CampaignHeader = ({
  campaignName,
  pageTitle,
  description,
  tabs,
  currentPath,
}: CampaignHeaderProps) => {
  return (
    <div className="mb-8 flex w-full flex-col border-b border-border-main bg-surface px-6 pt-8 md:px-8">
      <div className="mb-2 flex flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary">
          {pageTitle}
        </span>
        <h1 className="truncate text-3xl font-black tracking-tight text-text-main">
          {campaignName || "Loading..."}
        </h1>
      </div>

      <div className="mb-6 min-h-[40px]">
        <p className="max-w-3xl text-sm font-medium leading-relaxed text-text-muted">
          {description}
        </p>
      </div>

      <div className="w-full -mb-[1px]">
        <SectionTabs items={tabs} currentPath={currentPath} />
      </div>
    </div>
  );
};

export default CampaignHeader;
