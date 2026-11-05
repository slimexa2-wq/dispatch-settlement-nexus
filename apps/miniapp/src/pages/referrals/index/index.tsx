import Taro from "@tarojs/taro";
import { Text, View } from "@tarojs/components";
import { allJobs, api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, JobCard, MetricGrid, PageShell, SectionCard } from "../../../components/ui";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";
import { localMonthString } from "../../../domain/format";
import { jobDetailPath } from "../../../domain/links";

export default function ReferralHomePage() {
  const user = useSession();
  const jobs = useAsyncData(() => allJobs({ status: "RECRUITING" }), []);
  const referrals = useAsyncData(() => api.myReferrals(), []);
  const rewards = useAsyncData(() => api.myRewards(), []);
  if (!user) return <PageShell title="内部推荐" />;
  if (user.role !== "EMPLOYEE" || !user.permissions.includes("referral:create")) {
    return <AccessDenied message="内部推荐仅向已绑定人员档案的内部员工开放。" />;
  }
  const referralItems = referrals.data ? itemsOf(referrals.data) : [];
  const rewardItems = rewards.data ? itemsOf(rewards.data) : [];
  const currentMonth = localMonthString();
  const metrics = [
    { label: "本月推荐", value: referralItems.filter((item) => item.createdAt?.startsWith(currentMonth)).length, path: "/pages/referrals/mine/index" },
    { label: "已入职", value: referralItems.filter((item) => Boolean(item.person?.onboardDate)).length, path: "/pages/referrals/mine/index" },
    {
      label: "待达成奖励",
      value: rewardItems.filter((item) => item.status === "PENDING").reduce((sum, item) => sum + Number(item.amount), 0),
      path: "/pages/referrals/rewards/index"
    },
    {
      label: "已发放奖励",
      value: rewardItems.filter((item) => item.status === "PAID").reduce((sum, item) => sum + Number(item.amount), 0),
      path: "/pages/referrals/rewards/index"
    }
  ];
  return (
    <PageShell title="内部推荐" subtitle="推荐人由当前员工身份自动绑定，政策按岗位和员工类型匹配">
      <AsyncBoundary
        loading={referrals.loading || rewards.loading}
        error={referrals.error ?? rewards.error}
        onRetry={() => {
          void referrals.reload();
          void rewards.reload();
        }}
      >
        <MetricGrid metrics={metrics} />
      </AsyncBoundary>
      <SectionCard title="可推荐岗位">
        <AsyncBoundary loading={jobs.loading} error={jobs.error} empty={!jobs.data?.items.length} emptyText="暂无可推荐岗位" onRetry={() => void jobs.reload()}>
          {(jobs.data?.items ?? []).map((job) => (
            <JobCard
              key={job.id}
              job={job}
              actionLabel="推荐、转发或生成二维码"
              onClick={() => void Taro.navigateTo({ url: jobDetailPath(job.id) })}
            />
          ))}
        </AsyncBoundary>
      </SectionCard>
      <View className="notice"><Text>推荐链接使用服务端签名并自动绑定当前员工；岗位海报可本地预览，真实推荐二维码只在小程序 AppID、发布页面和合法域名配置完成后嵌入。</Text></View>
    </PageShell>
  );
}
