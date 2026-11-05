import Taro from "@tarojs/taro";
import { Button, Image, Swiper, SwiperItem, Text, View } from "@tarojs/components";
import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import { configurationGaps } from "../config/runtime";
import { runtimeConfig } from "../config/runtime";
import { getAccessToken } from "../auth/session";
import { formatDate, projectName, statusLabel } from "../domain/format";
import type { JobDemand, Person, ProjectImage } from "../api/types";

export function PageShell({
  title,
  subtitle,
  children,
  showConfigGap = false
}: PropsWithChildren<{ title: string; subtitle?: string; showConfigGap?: boolean }>) {
  return (
    <View className="page-shell">
      <View className="page-heading">
        <Text className="page-title">{title}</Text>
        {subtitle ? <Text className="page-subtitle">{subtitle}</Text> : null}
      </View>
      {showConfigGap ? <ConfigGapBanner /> : null}
      {children}
    </View>
  );
}

export function ConfigGapBanner() {
  if (!configurationGaps.length) return null;
  return (
    <View className="config-gap">
      <Text className="config-gap__title">开发配置缺口</Text>
      {configurationGaps.map((gap) => (
        <Text className="config-gap__item" key={gap}>• {gap}</Text>
      ))}
    </View>
  );
}

export function SectionCard({ title, action, children }: PropsWithChildren<{ title?: string; action?: ReactNode }>) {
  return (
    <View className="section-card">
      {title || action ? (
        <View className="section-card__head">
          <Text className="section-card__title">{title}</Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function StatePanel({
  title,
  description,
  actionText,
  onAction
}: {
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}) {
  return (
    <View className="state-panel">
      <Text className="state-panel__title">{title}</Text>
      {description ? <Text className="state-panel__description">{description}</Text> : null}
      {actionText && onAction ? <Button className="button button--ghost state-panel__button" onClick={onAction}>{actionText}</Button> : null}
    </View>
  );
}

export function AsyncBoundary({
  loading,
  error,
  empty,
  emptyText = "暂无数据",
  onRetry,
  children
}: PropsWithChildren<{
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
}>) {
  if (loading) return <StatePanel title="正在加载" description="请稍候…" />;
  if (error) return <StatePanel title="加载失败" description={error} actionText="重试" onAction={onRetry} />;
  if (empty) return <StatePanel title={emptyText} description="数据缺失时保持为空，不填入示例数据。" />;
  return <>{children}</>;
}

export function AccessDenied({ message = "当前账号没有访问此页面的权限" }: { message?: string }) {
  return (
    <PageShell title="无权限">
      <StatePanel title="访问受限" description={message} actionText="返回首页" onAction={() => void Taro.reLaunch({ url: "/pages/index/index" })} />
    </PageShell>
  );
}

export function StatusTag({ status }: { status?: string | null }) {
  const positive = ["RECRUITING", "ACTIVE", "PASSED", "ARRIVED", "ACHIEVED", "PAID", "PUBLISHED"].includes(status ?? "");
  const negative = ["FAILED", "ABANDONED", "LEFT", "ENDED", "CANCELLED", "WITHDRAWN"].includes(status ?? "");
  const className = "status-tag" + (positive ? " status-tag--positive" : "") + (negative ? " status-tag--negative" : "");
  return <Text className={className}>{statusLabel(status)}</Text>;
}

export function FieldRow({ label, value, sensitive = false }: { label: string; value?: ReactNode; sensitive?: boolean }) {
  return (
    <View className="field-row">
      <Text className="field-row__label">{label}</Text>
      <Text className={sensitive ? "field-row__value field-row__value--sensitive" : "field-row__value"}>{value ?? "暂无"}</Text>
    </View>
  );
}

export function MetricGrid({ metrics }: { metrics: Array<{ label: string; value: string | number; path?: string }> }) {
  return (
    <View className="metric-grid">
      {metrics.map((metric) => (
        <View className="metric-card" key={metric.label} onClick={metric.path ? () => void Taro.navigateTo({ url: metric.path as string }) : undefined}>
          <Text className="metric-card__value">{metric.value}</Text>
          <Text className="metric-card__label">{metric.label}</Text>
          {metric.path ? <Text className="metric-card__hint">查看明细 ›</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function PersonCard({ person, showSensitive: _showSensitive = false, onClick }: { person: Person; showSensitive?: boolean; onClick?: () => void }) {
  return (
    <View className="person-card" onClick={onClick}>
      <View className="card-title-row">
        <Text className="card-title">{person.name}</Text>
        <StatusTag status={person.employmentStatus ?? person.status ?? person.interviewStatus} />
      </View>
      <Text className="card-meta">{person.phone} · {person.jobTitle ?? "综合岗位"}</Text>
      <Text className="card-meta">{projectName(person)} · 面试 {formatDate(person.interviewDate)}</Text>
      {person.notes ? <Text className="card-note">备注：{person.notes}</Text> : null}
    </View>
  );
}

export function JobCard({ job, onClick, actionLabel }: { job: JobDemand; onClick: () => void; actionLabel?: string }) {
  const remaining = job.remainingCount ?? job.progress?.remainingGap ?? Math.max(0, job.requiredCount - (job.onboardedCount ?? 0));
  return (
    <View className="job-card" onClick={onClick}>
      <View className="card-title-row">
        <Text className="card-title">{job.title}</Text>
        <StatusTag status={job.status} />
      </View>
      <Text className="job-card__salary">{job.salary}</Text>
      <Text className="card-meta">{projectName(job)} · {job.workLocation}</Text>
      <Text className="card-note">工作内容：{job.workContent ?? "按项目安排完成现场作业"}</Text>
      <Text className="card-note">岗位要求：{job.requirements}</Text>
      <View className="job-card__footer">
        <Text className="card-meta">需求 {job.requiredCount} 人 · 缺口 {remaining} 人</Text>
        <Text className="link-text">{actionLabel ?? "查看详情"} ›</Text>
      </View>
    </View>
  );
}

export function ProjectGallery({ images }: { images?: ProjectImage[] }) {
  if (!images?.length) return <StatePanel title="项目形象图" description="项目园区与岗位环境图片随项目档案统一展示。" />;
  return <AuthenticatedGallery images={images} />;
}

function AuthenticatedGallery({ images }: { images: ProjectImage[] }) {
  const [sources, setSources] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [failedCount, setFailedCount] = useState(0);
  const sorted = [...images].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const imageKey = sorted.map((item) => item.id + ":" + (item.url ?? "")).join("|");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailedCount(0);
    const token = getAccessToken();
    void Promise.allSettled(sorted.map(async (item) => {
      if (item.url) return { id: item.id, source: item.url };
      const response = await Taro.downloadFile({
        url: runtimeConfig.apiBaseUrl + (token ? "/project-images/" : "/public/project-images/") + encodeURIComponent(item.id) + "/content",
        header: token ? { Authorization: "Bearer " + token } : {}
      });
      if (response.statusCode !== 200) throw new Error("项目图片下载失败");
      return { id: item.id, source: response.tempFilePath };
    })).then((results) => {
      if (!active) return;
      const next: Record<string, string> = {};
      let failures = 0;
      for (const result of results) {
        if (result.status === "fulfilled") next[result.value.id] = result.value.source;
        else failures += 1;
      }
      setSources(next);
      setFailedCount(failures);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [imageKey]);

  const ready = sorted.filter((item) => sources[item.id]);
  if (loading) return <StatePanel title="正在加载项目实拍图" />;
  if (!ready.length) return <StatePanel title="项目实拍图加载失败" description="请检查文件服务和登录状态。" />;
  return (
    <View>
      {failedCount ? <Text className="muted">{failedCount} 张图片加载失败</Text> : null}
      <Swiper className="project-gallery" indicatorDots circular autoplay>
        {ready.map((item) => (
          <SwiperItem key={item.id}>
            <Image className="project-gallery__image" src={sources[item.id] ?? ""} mode="aspectFill" />
            {item.note ? <Text className="project-gallery__note">{item.note}</Text> : null}
          </SwiperItem>
        ))}
      </Swiper>
    </View>
  );
}
