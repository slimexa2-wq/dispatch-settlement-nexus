import Taro from "@tarojs/taro";
import { Button, Canvas, Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { api } from "../../../api/services";
import type { JobDemand } from "../../../api/types";
import { getAccessToken } from "../../../auth/session";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, ProjectGallery, SectionCard, StatusTag } from "../../../components/ui";
import { runtimeConfig } from "../../../config/runtime";
import { formatDate, projectName } from "../../../domain/format";
import { jobDetailPath } from "../../../domain/links";
import { portalForRole } from "../../../domain/roles";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

async function loadJob(id: string, authenticated: boolean): Promise<JobDemand> {
  return authenticated ? api.job(id) : api.publicJob(id);
}

export default function JobDetailPage() {
  const user = useSession(false);
  const params = Taro.getCurrentInstance().router?.params ?? {};
  const id = params.id ?? "";
  const referralToken = params.ref;
  const [sharePath, setSharePath] = useState<string | null>(null);
  const job = useAsyncData(
    () => id ? loadJob(id, Boolean(user)) : Promise.reject(new Error("缺少岗位 ID")),
    [id, Boolean(user)]
  );

  Taro.useShareAppMessage(() => ({
    title: job.data?.title ? `祥能招聘｜${job.data.title}` : "祥能招聘岗位",
    path: sharePath ?? jobDetailPath(id, referralToken)
  }));

  useEffect(() => {
    if (!user || user.role !== "EMPLOYEE" || !id || !user.permissions.includes("referral:create")) return;
    let cancelled = false;
    void api.createReferralShare(id).then((share) => {
      if (!cancelled) setSharePath(share.path);
    }).catch(() => {
      if (!cancelled) setSharePath(null);
    });
    return () => { cancelled = true; };
  }, [id, user?.id]);

  if (user && !user.permissions.includes("job:read")) return <AccessDenied />;
  const data = job.data;
  const phone = data?.project?.managerPhone ?? null;
  const portal = user ? portalForRole(user.role) : "job-seeker";
  const applyLabel = portal === "supplier" ? "立即报人" : portal === "employee" ? "推荐报名" : portal === "operator" ? "代为报名" : "在线报名";
  const canApply = !user || user.permissions.includes("application:create") || user.permissions.includes("referral:create");

  const copyReferralLink = async () => {
    if (!sharePath) {
      await Taro.showToast({ title: "推荐链接生成中，请稍后重试", icon: "none" });
      return;
    }
    await Taro.setClipboardData({ data: sharePath });
  };

  const createReferralQrFile = async (): Promise<string> => {
    if (!runtimeConfig.wechatConfigured) throw new Error("真实微信小程序配置尚未完成");
    const accessToken = getAccessToken();
    if (!accessToken || !data) throw new Error("登录状态或岗位信息无效");
    const response = await Taro.request<ArrayBuffer>({
      url: `${runtimeConfig.apiBaseUrl}/wechat/referral-qrcode`,
      method: "POST",
      data: { jobDemandId: data.id },
      responseType: "arraybuffer",
      header: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    });
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`二维码生成失败（${response.statusCode}）`);
    const filePath = `${Taro.env.USER_DATA_PATH}/xiangneng-referral-${data.id}.png`;
    await new Promise<void>((resolve, reject) => {
      Taro.getFileSystemManager().writeFile({ filePath, data: response.data, success: () => resolve(), fail: reject });
    });
    return filePath;
  };

  const previewReferralQr = async () => {
    if (!runtimeConfig.wechatConfigured) {
      await Taro.showModal({
        title: "推荐二维码尚未启用",
        content: "需要真实小程序 AppID、AppSecret、已发布页面和合法域名；当前不会生成假二维码。",
        showCancel: false
      });
      return;
    }
    try {
      const filePath = await createReferralQrFile();
      await Taro.previewImage({ urls: [filePath] });
    } catch (error) {
      await Taro.showModal({ title: "二维码生成失败", content: error instanceof Error ? error.message : "请稍后重试", showCancel: false });
    }
  };

  const previewReferralPoster = async () => {
    if (!data || !sharePath) return;
    try {
      let qrFile: string | undefined;
      if (runtimeConfig.wechatConfigured) qrFile = await createReferralQrFile();
      const context = Taro.createCanvasContext("referralPoster");
      context.setFillStyle("#f4f7f9");
      context.fillRect(0, 0, 600, 900);
      context.setFillStyle("#0f766e");
      context.fillRect(0, 0, 600, 150);
      context.setFillStyle("#ffffff");
      context.setFontSize(42);
      context.fillText("祥能招聘", 48, 88);
      context.setFillStyle("#12333b");
      context.setFontSize(34);
      context.fillText(data.title.slice(0, 16), 48, 220);
      context.setFontSize(24);
      context.setFillStyle("#0f766e");
      context.fillText(data.salary || "薪资面议", 48, 270);
      context.setFillStyle("#435b62");
      context.fillText(`项目：${projectName(data).slice(0, 20)}`, 48, 330);
      context.fillText(`地点：${data.workLocation.slice(0, 20)}`, 48, 380);
      context.fillText(`需求：${data.requiredCount} 人`, 48, 430);
      context.fillText(`截止：${formatDate(data.deadline)}`, 48, 480);
      context.setFillStyle("#ffffff");
      context.fillRect(40, 530, 520, 300);
      if (qrFile) {
        context.drawImage(qrFile, 210, 555, 180, 180);
        context.setFillStyle("#12333b");
        context.setFontSize(22);
        context.fillText("长按识别推荐二维码报名", 166, 780);
      } else {
        context.setFillStyle("#d97706");
        context.setFontSize(24);
        context.fillText("推荐二维码待真实微信配置后展示", 100, 670);
        context.setFillStyle("#435b62");
        context.setFontSize(20);
        context.fillText("可先使用微信转发或复制推荐链接", 120, 720);
      }
      await new Promise<void>((resolve) => context.draw(false, () => resolve()));
      const poster = await Taro.canvasToTempFilePath({
        canvasId: "referralPoster",
        width: 600,
        height: 900,
        destWidth: 1200,
        destHeight: 1800,
        fileType: "png"
      });
      await Taro.previewImage({ urls: [poster.tempFilePath] });
    } catch (error) {
      await Taro.showModal({ title: "海报生成失败", content: error instanceof Error ? error.message : "请稍后重试", showCancel: false });
    }
  };

  const contact = async (mode: "call" | "copy") => {
    if (!phone) {
      await Taro.showToast({ title: "请联系项目运营中心", icon: "none" });
      return;
    }
    if (mode === "call") await Taro.makePhoneCall({ phoneNumber: phone });
    else {
      await Taro.setClipboardData({ data: phone });
    }
  };

  return (
    <PageShell title="岗位详情" subtitle="负责人、项目简介和实拍图只从项目档案读取">
      <AsyncBoundary loading={job.loading} error={job.error} empty={!data} onRetry={() => void job.reload()}>
        {data ? (
          <>
            <SectionCard>
              <View className="card-title-row">
                <Text className="page-title">{data.title}</Text>
                <StatusTag status={data.status} />
              </View>
              <Text className="job-card__salary">{data.salary}</Text>
              <Text className="card-meta">{projectName(data)}</Text>
            </SectionCard>
            <SectionCard title="项目实拍图">
              <ProjectGallery images={data.projectImages ?? data.project?.images} />
            </SectionCard>
            <SectionCard title="岗位信息">
              <FieldRow label="需求人数" value={String(data.requiredCount)} />
              <FieldRow label="工作时间" value={data.workTime} />
              <FieldRow label="工作地点" value={data.workLocation} />
              <FieldRow label="报名截止" value={formatDate(data.deadline)} />
            </SectionCard>
            <SectionCard title="工作内容">
              <Text className="muted">{data.workContent ?? "按项目安排完成现场生产、质检、包装、物料流转等工作。"}</Text>
            </SectionCard>
            <SectionCard title="岗位要求">
              <Text className="muted">{data.requirements}</Text>
            </SectionCard>
            <SectionCard title="项目信息">
              <FieldRow label="项目简介" value={data.project?.description ?? "提供招聘、入职、在职与离职全流程服务"} />
              <FieldRow label="归属分子公司" value={data.project?.branch?.name ?? data.project?.branchName ?? "祥能项目运营中心"} />
              <FieldRow label="项目负责人" value={data.project?.managerName ?? "项目运营负责人"} />
              <FieldRow label="联系方式" value={phone ?? "暂无"} sensitive />
            </SectionCard>
            <View className="action-row">
              <Button className="button button--secondary" onClick={() => void contact("call")}>联系负责人</Button>
              <Button className="button button--secondary" onClick={() => void contact("copy")}>复制联系方式</Button>
            </View>
            <Button
              className="button"
              disabled={data.status !== "RECRUITING" || !canApply}
              onClick={() => void Taro.navigateTo({
                url: `/pages/application/form/index?jobId=${encodeURIComponent(data.id)}${referralToken ? `&ref=${encodeURIComponent(referralToken)}` : ""}`
              })}
            >
              {data.status !== "RECRUITING" ? "当前岗位不可报名" : canApply ? applyLabel : "当前账号仅可查看"}
            </Button>
            {user?.role === "EMPLOYEE" && user.permissions.includes("referral:create") ? (
              <View className="action-row">
                <Button className="button button--secondary" disabled={!sharePath} onClick={() => void copyReferralLink()}>复制推荐链接</Button>
                <Button className="button button--secondary" openType="share" disabled={!sharePath}>微信转发</Button>
                <Button className="button button--secondary" onClick={() => void previewReferralQr()}>推荐二维码</Button>
                <Button className="button button--secondary" disabled={!sharePath} onClick={() => void previewReferralPoster()}>岗位海报</Button>
              </View>
            ) : null}
            <Canvas canvasId="referralPoster" className="poster-canvas" />
          </>
        ) : null}
      </AsyncBoundary>
    </PageShell>
  );
}
