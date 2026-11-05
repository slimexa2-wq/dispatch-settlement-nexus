import Taro from "@tarojs/taro";
import { Button, Input, Text, Textarea, View } from "@tarojs/components";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, itemsOf } from "../../api/services";
import type { AdvanceRequest, AppealRecord, BlacklistRecord, ElectronicContract, JobDemand, Person, SalarySlip } from "../../api/types";

type DemoRole = "operator" | "supplier" | "employee" | "candidate";
type DemoView = "home" | "jobs" | "people" | "detail" | "blacklist" | "appeals" | "salary" | "advance" | "contracts" | "mine";

const roleLabels: Record<DemoRole, string> = {
  operator: "现场运营",
  supplier: "供应商",
  employee: "员工",
  candidate: "求职者"
};

function navForRole(role: DemoRole): Array<{ label: string; key: DemoView }> {
  if (role === "operator") return [
    { label: "工作台", key: "home" },
    { label: "人员", key: "people" },
    { label: "任务", key: "appeals" },
    { label: "我的", key: "mine" }
  ];
  if (role === "supplier") return [
    { label: "招聘需求", key: "jobs" },
    { label: "我的人员", key: "people" },
    { label: "我的数据", key: "home" },
    { label: "我的", key: "mine" }
  ];
  if (role === "employee") return [
    { label: "首页", key: "home" },
    { label: "内部推荐", key: "jobs" },
    { label: "工资条", key: "salary" },
    { label: "我的", key: "mine" }
  ];
  return [
    { label: "找工作", key: "jobs" },
    { label: "报名进度", key: "detail" },
    { label: "我的", key: "mine" }
  ];
}

const fallbackPeople: Person[] = [
  { id: "p1", name: "张三", phone: "139****8888", idCard: "4403********1234", projectId: "demo-project", projectName: "锂电新材外包", jobTitle: "普工", interviewStatus: "PENDING_ARRIVAL", employmentStatus: "APPLICANT", interviewDate: "2026-07-19" },
  { id: "p2", name: "李四", phone: "138****6688", idCard: "5107********6688", projectId: "demo-project", projectName: "京能电子司机", jobTitle: "包装工", interviewStatus: "ARRIVED", employmentStatus: "INTERVIEWING", interviewDate: "2026-07-19" },
  { id: "p3", name: "刘强", phone: "136****3456", idCard: "5101********3456", projectId: "demo-project", projectName: "索尔思外包", jobTitle: "操作工", interviewStatus: "FAILED", employmentStatus: "APPLICANT", interviewDate: "2026-07-19" }
];

const fallbackJobs: JobDemand[] = [
  { id: "j1", title: "电气安装工", projectId: "demo-project", projectName: "祥能大厦项目", requiredCount: 20, appliedCount: 8, workContent: "负责现场电气设备安装、线路整理、配合班组完成调试和安全检查。", requirements: "持有效电工证，高空作业证优先", salary: "38元/小时", workTime: "长白班", workLocation: "项目现场", deadline: "2026-08-31", status: "RECRUITING" },
  { id: "j2", title: "焊工（持证）", projectId: "demo-project", projectName: "国际金融中心项目", requiredCount: 15, appliedCount: 5, workContent: "负责钢结构焊接、焊缝处理、现场材料交接和质量自检。", requirements: "持焊工证，熟悉氩弧焊/二保焊", salary: "9000-12000元/月", workTime: "两班倒", workLocation: "项目现场", deadline: "2026-08-31", status: "RECRUITING" }
];

const fallbackBlacklist: BlacklistRecord[] = [
  { id: "b1", personId: "p3", name: "刘强", idCard: "5101********3456", phone: "136****3456", reason: "上个项目旷工离场且未完成工具交接，限制再次报名。", status: "ACTIVE", operatorName: "系统管理员", createdAt: "2026-07-19" }
];

const fallbackAppeals: AppealRecord[] = [
  { id: "a1", ownerType: "SUPPLIER", ownerName: "圆联劳务", type: "EMPLOYEE_STATUS", content: "李四已到场但状态未同步，请运营复核。", status: "PROCESSING", createdAt: "2026-07-19" }
];

const fallbackAdvances: AdvanceRequest[] = [
  { id: "ad1", personName: "张三", personId: "p1", amount: 1000, reason: "家庭临时周转，申请从下月工资扣回。", status: "PENDING", createdAt: "2026-07-19" }
];

const fallbackContracts: ElectronicContract[] = [
  {
    id: "ec1",
    personId: "p1",
    personName: "张三",
    templateId: "tpl1",
    templateName: "祥能一线员工劳动合同模板",
    sealId: "seal1",
    sealName: "祥能人力电子合同专用章",
    contractNo: "XNHT-20260719-001",
    status: "READY_TO_SIGN",
    materialNames: ["身份证正反面", "银行卡照片"],
    dueDate: "2026-07-31",
    createdAt: "2026-07-19"
  }
];

function statusLabel(status?: string | null): string {
  const map: Record<string, string> = {
    PENDING_ARRIVAL: "待到场",
    ARRIVED: "已到场",
    PASSED: "面试通过",
    FAILED: "未通过",
    APPLICANT: "已报名",
    INTERVIEWING: "面试中",
    PENDING_ONBOARD: "待入职",
    ACTIVE: "在职",
    LEFT: "离职",
    ONBOARDED: "已入职",
    NOT_ONBOARDED: "未入职",
    REGULARIZED: "已转正",
    PENDING: "待处理",
    PROCESSING: "处理中",
    PENDING_UPLOAD: "待上传资料",
    READY_TO_SIGN: "待签署",
    SIGNED: "已签署",
    ARCHIVED: "已归档",
    CANCELLED: "已取消"
  };
  return status ? map[status] ?? status : "暂无";
}

function personStatus(person: Person): string {
  if (person.offboardDate || person.employmentStatus === "LEFT") return "已离职";
  if (person.employmentStatus === "ACTIVE" && String(person.notes ?? "").includes("转正")) return "已转正";
  if (person.onboardDate || person.employmentStatus === "ACTIVE") return "已入职";
  if (person.interviewStatus === "FAILED") return "面试未通过";
  if (person.interviewStatus === "ABANDONED") return "未入职";
  if (person.interviewStatus === "PASSED" || person.employmentStatus === "PENDING_ONBOARD") return "面试通过";
  if (person.interviewStatus === "ARRIVED" || person.employmentStatus === "INTERVIEWING") return "已到达";
  return "已报名";
}

function MiniMetric({ label, value, tone, onClick }: { label: string; value: string | number; tone: string; onClick?: () => void }) {
  return (
    <View className={`demo-metric demo-metric--${tone}`} onClick={onClick}>
      <Text className="demo-metric__value">{value}</Text>
      <Text className="demo-metric__label">{label}</Text>
    </View>
  );
}

function DemoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="demo-section">
      <Text className="demo-section__title">{title}</Text>
      {children}
    </View>
  );
}

function FieldLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="demo-field-line">
      <Text>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

export default function MiniappDemoPage() {
  const [role, setRole] = useState<DemoRole>("operator");
  const [view, setView] = useState<DemoView>("home");
  const [people, setPeople] = useState<Person[]>(fallbackPeople);
  const [jobs, setJobs] = useState<JobDemand[]>(fallbackJobs);
  const [salary, setSalary] = useState<SalarySlip[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistRecord[]>(fallbackBlacklist);
  const [appeals, setAppeals] = useState<AppealRecord[]>(fallbackAppeals);
  const [advances, setAdvances] = useState<AdvanceRequest[]>(fallbackAdvances);
  const [contracts, setContracts] = useState<ElectronicContract[]>(fallbackContracts);
  const [selectedId, setSelectedId] = useState("p1");
  const [dataMode, setDataMode] = useState("系统接口连接中");
  const [notice, setNotice] = useState("所有操作优先走系统接口；接口不可用时保留本地演示态。");
  const [applyName, setApplyName] = useState("刘强");
  const [applyPhone, setApplyPhone] = useState("136****3456");
  const [applyIdCard, setApplyIdCard] = useState("5101********3456");
  const [blackReason, setBlackReason] = useState("提供虚假入职资料，30天内禁止报名。");
  const [appealText, setAppealText] = useState("政策奖励金额和系统显示不一致，请复核。");
  const [advanceAmount, setAdvanceAmount] = useState("1500");
  const [advanceReason, setAdvanceReason] = useState("家庭临时用款，申请从下月工资扣回。");

  const selected = people.find((item) => item.id === selectedId) ?? people[0];
  const selectedJob = jobs[0];
  const selectedContract = (selected ? contracts.find((item) => item.personId === selected.id) : undefined) ?? contracts[0];
  const activeBlacklist = blacklist.filter((item) => item.status === "ACTIVE");
  const blackHit = useMemo(
    () => activeBlacklist.find((item) => item.name === applyName || item.idCard === applyIdCard || item.phone === applyPhone),
    [activeBlacklist, applyIdCard, applyName, applyPhone]
  );

  useEffect(() => {
    async function load() {
      try {
        const [peoplePage, jobsPage, salaryPage, blacklistPage, appealPage, advancePage, contractPage] = await Promise.all([
          api.people({ pageSize: 50 }),
          api.jobs({ pageSize: 50 }),
          api.mySalarySlips().catch(() => []),
          api.blacklistRecords({ pageSize: 50 }),
          api.appeals({ pageSize: 50 }),
          api.advanceRequests({ pageSize: 50 }),
          api.electronicContracts({ pageSize: 50 })
        ]);
        setPeople(itemsOf(peoplePage).length ? itemsOf(peoplePage) : fallbackPeople);
        setJobs(itemsOf(jobsPage).length ? itemsOf(jobsPage) : fallbackJobs);
        setSalary(itemsOf(salaryPage));
        setBlacklist(itemsOf(blacklistPage).length ? itemsOf(blacklistPage) : fallbackBlacklist);
        setAppeals(itemsOf(appealPage).length ? itemsOf(appealPage) : fallbackAppeals);
        setAdvances(itemsOf(advancePage).length ? itemsOf(advancePage) : fallbackAdvances);
        setContracts(itemsOf(contractPage).length ? itemsOf(contractPage) : fallbackContracts);
        setDataMode("已连接系统接口");
      } catch {
        setDataMode("本地演示态");
      }
    }
    void load();
  }, []);

  const changeRole = (next: DemoRole) => {
    setRole(next);
    setView(navForRole(next)[0]?.key ?? "home");
    setNotice(`已切换到${roleLabels[next]}端。`);
  };

  const addBlacklist = async () => {
    if (!selected) return;
    const record: BlacklistRecord = { id: `b${blacklist.length + 1}`, personId: selected.id, name: selected.name, idCard: selected.idCard ?? "", phone: selected.phone, reason: blackReason, status: "ACTIVE", operatorName: "演示管理员", createdAt: "2026-07-19" };
    try {
      const saved = await api.createBlacklistRecord(record);
      setBlacklist([saved, ...blacklist]);
      setDataMode("已连接系统接口");
    } catch {
      setBlacklist([record, ...blacklist]);
    }
    setNotice(`${selected.name} 已加入黑名单，报名会被拦截。`);
    setView("detail");
  };

  const submitApplication = async () => {
    if (blackHit) {
      setNotice(`报名被黑名单拦截：${blackHit.reason}`);
      setView("detail");
      return;
    }
    try {
      await api.registerPerson({ name: applyName, idCard: applyIdCard, phone: applyPhone, projectId: jobs[0]?.projectId ?? "", jobDemandId: jobs[0]?.id, jobTitle: jobs[0]?.title ?? "综合岗位", interviewDate: "2026-07-19", source: role === "supplier" ? "SUPPLIER" : role === "employee" ? "REFERRAL" : "SELF" });
      setDataMode("已连接系统接口");
    } catch {
      setPeople([{ ...fallbackPeople[0]!, id: `p${people.length + 1}`, name: applyName, phone: applyPhone, idCard: applyIdCard }, ...people]);
    }
    setNotice(`${applyName} 报名成功，进入同一人员主档。`);
    setView("people");
  };

  const submitAppeal = async () => {
    const record: AppealRecord = { id: `a${appeals.length + 1}`, ownerType: role === "supplier" ? "SUPPLIER" : "EMPLOYEE", ownerName: roleLabels[role], type: role === "employee" ? "SALARY" : "POLICY", content: appealText, status: "PENDING", createdAt: "2026-07-19" };
    try {
      const saved = await api.createAppeal(record);
      setAppeals([saved, ...appeals]);
      setDataMode("已连接系统接口");
    } catch {
      setAppeals([record, ...appeals]);
    }
    setNotice("申诉已提交。");
  };

  const submitAdvance = async () => {
    const record: AdvanceRequest = { id: `ad${advances.length + 1}`, personId: selected?.id, personName: selected?.name ?? "员工本人", amount: Number(advanceAmount || 0), reason: advanceReason, status: "PENDING", createdAt: "2026-07-19" };
    try {
      const saved = await api.createAdvanceRequest(record);
      setAdvances([saved, ...advances]);
      setDataMode("已连接系统接口");
    } catch {
      setAdvances([record, ...advances]);
    }
    setNotice("借支申请已提交。");
  };

  const attachSignedContractToPerson = (signed: ElectronicContract) => {
    setPeople((current) =>
      current.map((person) =>
        person.id === signed.personId
          ? {
              ...person,
              files: [
                ...(person.files ?? []).filter((file) => file.id !== (signed.signedFileId ?? `signed-${signed.id}`)),
                {
                  id: signed.signedFileId ?? `signed-${signed.id}`,
                  originalName: signed.signedFileName ?? `${signed.personName}-${signed.templateName}.pdf`,
                  createdAt: signed.archivedAt ?? signed.signedAt ?? "2026-07-19"
                }
              ]
            }
          : person
      )
    );
  };

  const submitContractSigning = async (target = selectedContract) => {
    if (!target) return;
    try {
      await api.uploadContractMaterial(target.id, "小程序上传：身份证正反面、银行卡照片、签名确认页");
      const signed = await api.signElectronicContract(target.id);
      setContracts((current) => current.map((item) => (item.id === signed.id ? signed : item)));
      attachSignedContractToPerson(signed);
      setSelectedId(signed.personId);
      setDataMode("已连接系统接口");
      setNotice("电子合同已签署完成，并自动归档到后台人员附件。");
      setView("contracts");
    } catch {
      const signed: ElectronicContract = {
        ...target,
        status: "SIGNED",
        materialNames: Array.from(new Set([...(target.materialNames ?? []), "本地演示：签署资料"])),
        signedFileId: `signed-${target.id}`,
        signedFileName: `已签署-${target.personName}-${target.templateName}.pdf`,
        signedAt: "2026-07-19",
        archivedAt: "2026-07-19"
      };
      setContracts((current) => current.map((item) => (item.id === signed.id ? signed : item)));
      attachSignedContractToPerson(signed);
      setSelectedId(signed.personId);
      setNotice("电子合同已签署（本地演示态），并展示在人员附件中。");
      setView("contracts");
    }
  };

  const renderHome = () => (
    <>
      <View className={`demo-hero demo-hero--${role}`}>
        <Text className="demo-hero__eyebrow">{roleLabels[role]}端 · {dataMode}</Text>
        <Text className="demo-hero__title">
          {role === "operator" ? "现场面试与入离职处理" : role === "supplier" ? "招聘需求、报人、进度" : role === "employee" ? "推荐、工资、借支" : "岗位查看与在线报名"}
        </Text>
        <Text className="demo-hero__meta">{notice}</Text>
      </View>
      <View className="demo-metric-grid">
        <MiniMetric label="人员" value={people.length} tone="blue" onClick={() => setView("people")} />
        <MiniMetric label="岗位" value={jobs.length} tone="green" onClick={() => setView("jobs")} />
        <MiniMetric label="报名拦截" value={activeBlacklist.length} tone="orange" onClick={() => setView("detail")} />
        <MiniMetric label="申诉/借支" value={appeals.length + advances.length} tone="purple" onClick={() => setView(role === "employee" ? "advance" : "appeals")} />
      </View>
      <DemoSection title="快捷入口">
        <View className="demo-action-grid">
          {navForRole(role).map(({ label, key }) => (
            <View className="demo-action" key={key} onClick={() => setView(key as DemoView)}>
              <Text className="demo-action__icon">＋</Text>
              <Text className="demo-action__text">{label}</Text>
            </View>
          ))}
        </View>
      </DemoSection>
    </>
  );

  const renderJobs = () => (
    <>
      <View className="demo-search-row">🔎 搜索岗位、项目、工种 <Text>筛选</Text></View>
      {jobs.map((job) => (
        <View className="demo-job-card" key={job.id}>
          <View className="demo-card-head">
            <Text className="demo-card-title">{job.title}</Text>
            <Text className="demo-status demo-status--hot">急招</Text>
          </View>
          <FieldLine label="项目地点" value={job.projectName ?? job.project?.name ?? "综合招聘项目"} />
          <FieldLine label="需求人数" value={`${job.requiredCount}人`} />
          <FieldLine label="报名人数" value={`${job.appliedCount ?? job.progress?.registered ?? 0}人`} />
          <FieldLine label="工作地点" value={job.workLocation} />
          <FieldLine label="工作时间" value={job.workTime} />
          <Text className="demo-price">{job.salary}</Text>
          <Text className="demo-line">工作内容：{job.workContent || "按项目安排完成现场生产、质检、包装、物料流转等工作。"}</Text>
          <Text className="demo-line">岗位要求：{job.requirements}</Text>
          <Button className="demo-wide-button" onClick={() => setView("detail")}>查看详情并报名</Button>
        </View>
      ))}
    </>
  );

  const renderPeople = () => (
    <>
      <View className="demo-filter-tabs">
        {(role === "supplier" ? ["全部", "已报名", "面试通过", "已入职", "在职", "离职"] : ["全部", "已到场", "面试通过", "待入职"]).map((item) => <Text key={item}>{item}</Text>)}
      </View>
      {people.map((person) => (
        <View className="demo-person-card" key={person.id} onClick={() => { setSelectedId(person.id); setView("detail"); }}>
          <View className="demo-card-head">
            <Text className="demo-card-title">{person.name}</Text>
            <Text className="demo-status">{activeBlacklist.some((item) => item.name === person.name || item.idCard === person.idCard) ? "黑名单" : personStatus(person)}</Text>
          </View>
          <Text className="demo-line">{person.phone} · {person.jobTitle}</Text>
          <Text className="demo-line">{person.projectName ?? person.project?.name ?? "综合招聘项目"}</Text>
        </View>
      ))}
    </>
  );

  const renderDetail = () => (
    <>
      {role !== "operator" && selectedJob ? (
        <>
          <DemoSection title="岗位详情">
            <FieldLine label="岗位" value={selectedJob.title} />
            <FieldLine label="项目" value={selectedJob.projectName ?? selectedJob.project?.name ?? "综合招聘项目"} />
            <FieldLine label="薪资" value={selectedJob.salary} />
            <FieldLine label="需求人数" value={`${selectedJob.requiredCount}人`} />
            <FieldLine label="工作地点" value={selectedJob.workLocation} />
            <FieldLine label="工作时间" value={selectedJob.workTime} />
          </DemoSection>
          <DemoSection title="工作内容">
            <Text className="demo-line">{selectedJob.workContent || "按项目安排完成现场生产、质检、包装、物料流转等工作。"}</Text>
          </DemoSection>
          <DemoSection title="岗位要求">
            <Text className="demo-line">{selectedJob.requirements}</Text>
          </DemoSection>
        </>
      ) : (
      <DemoSection title="人员详情 / 报名">
        <FieldLine label="姓名" value={selected?.name ?? "暂无"} />
        <FieldLine label="手机号" value={selected?.phone ?? "暂无"} />
        <FieldLine label="身份证" value={selected?.idCard ?? "暂无"} />
        <FieldLine label="项目" value={selected?.projectName ?? selected?.project?.name ?? "综合招聘项目"} />
        <FieldLine label="岗位" value={selected?.jobTitle ?? "综合岗位"} />
        <FieldLine label="状态" value={selected ? personStatus(selected) : "暂无"} />
        {role === "operator" ? <Button className="demo-mini-button demo-mini-button--warn" onClick={addBlacklist}>设置黑名单</Button> : null}
      </DemoSection>
      )}
      {role === "operator" ? (
        <DemoSection title="附件资料">
          {selected?.files?.length
            ? selected.files.map((file) => <Text className="demo-form-row" key={file.id}>{file.originalName} · {file.createdAt ?? "暂无时间"}</Text>)
            : <Text className="demo-form-row">暂无附件。电子合同签署完成后会自动归档到这里。</Text>}
        </DemoSection>
      ) : null}
      <DemoSection title="报名演示">
        <Input className="demo-input" value={applyName} placeholder="姓名" onInput={(event) => setApplyName(String(event.detail.value))} />
        <Input className="demo-input" value={applyPhone} placeholder="手机号" onInput={(event) => setApplyPhone(String(event.detail.value))} />
        <Input className="demo-input" value={applyIdCard} placeholder="身份证号" onInput={(event) => setApplyIdCard(String(event.detail.value))} />
        {blackHit ? <Text className="demo-error">命中黑名单：{blackHit.reason}</Text> : null}
        <Button className="demo-wide-button" onClick={submitApplication}>{role === "supplier" ? "提交报人" : role === "employee" ? "推荐并报名" : "提交报名"}</Button>
      </DemoSection>
    </>
  );

  const renderBlacklist = () => (
    <DemoSection title="黑名单">
      {activeBlacklist.map((item) => (
        <View className="demo-policy-card" key={item.id}>
          <Text className="demo-card-title">{item.name} · 禁止报名</Text>
          <Text className="demo-line">原因：{item.reason}</Text>
          <Text className="demo-line">操作人：{item.operatorName ?? "系统管理员"}</Text>
        </View>
      ))}
    </DemoSection>
  );

  const renderAppeals = () => (
    <>
      <DemoSection title="发起申诉">
        <Textarea className="demo-textarea" value={appealText} onInput={(event) => setAppealText(String(event.detail.value))} />
        <Button className="demo-wide-button" onClick={submitAppeal}>提交申诉</Button>
      </DemoSection>
      <DemoSection title="申诉记录">
        {appeals.map((item) => <Text className="demo-form-row" key={item.id}>{statusLabel(item.status)} · {item.content}</Text>)}
      </DemoSection>
    </>
  );

  const renderAdvance = () => (
    <>
      <DemoSection title="员工借支申请">
        <Input className="demo-input" value={advanceAmount} type="number" onInput={(event) => setAdvanceAmount(String(event.detail.value))} />
        <Textarea className="demo-textarea" value={advanceReason} onInput={(event) => setAdvanceReason(String(event.detail.value))} />
        <Button className="demo-wide-button" onClick={submitAdvance}>提交借支申请</Button>
      </DemoSection>
      <DemoSection title="借支记录">
        {advances.map((item) => <Text className="demo-form-row" key={item.id}>￥{item.amount} · {statusLabel(item.status)} · {item.reason}</Text>)}
      </DemoSection>
    </>
  );

  const renderSalary = () => (
    <DemoSection title="我的工资条">
      {salary.length ? salary.map((item) => <Text className="demo-form-row" key={item.id}>{item.salaryMonth} · 实发 ￥{item.netPay}</Text>) : <Text className="demo-form-row">暂无工资条，登录员工账号后同步系统数据</Text>}
    </DemoSection>
  );

  const renderContracts = () => (
    <DemoSection title="电子合同签署">
      {contracts.length ? contracts.map((contract) => (
        <View className="demo-policy-card" key={contract.id}>
          <View className="demo-card-head">
            <Text className="demo-card-title">{contract.templateName}</Text>
            <Text className="demo-status">{statusLabel(contract.status)}</Text>
          </View>
          <FieldLine label="签署员工" value={contract.personName} />
          <FieldLine label="合同编号" value={contract.contractNo} />
          <FieldLine label="用章" value={contract.sealName ?? "祥能电子合同专用章"} />
          <FieldLine label="截止日期" value={contract.dueDate ?? "以合同约定为准"} />
          <Text className="demo-line">已上传资料：{contract.materialNames?.length ? contract.materialNames.join("、") : "待上传"}</Text>
          {contract.signedFileName ? <Text className="demo-line">归档附件：{contract.signedFileName}</Text> : null}
          {contract.status === "SIGNED" || contract.status === "ARCHIVED"
            ? <Button className="demo-wide-button" onClick={() => { setSelectedId(contract.personId); setView("detail"); }}>查看人员附件</Button>
            : <Button className="demo-wide-button" onClick={() => submitContractSigning(contract)}>上传资料并签署</Button>}
        </View>
      )) : <Text className="demo-form-row">暂无待签署合同。</Text>}
    </DemoSection>
  );

  const renderMine = () => (
    <>
      <DemoSection title="我的">
        <FieldLine label="当前角色" value={roleLabels[role]} />
        <Text className="demo-line">切换角色不退出登录，不重新输入验证码；数据仍然读取同一套系统演示数据。</Text>
      </DemoSection>
      <DemoSection title="角色快速切换">
        <View className="demo-action-grid">
          {(["operator", "supplier", "candidate", "employee"] as DemoRole[]).map((item) => (
            <View className="demo-action" key={item} onClick={() => changeRole(item)}>
              <Text className="demo-action__icon">{role === item ? "✓" : "↔"}</Text>
              <Text className="demo-action__text">{roleLabels[item]}</Text>
            </View>
          ))}
        </View>
      </DemoSection>
      <DemoSection title="业务处理">
        <Button className="demo-wide-button" onClick={() => setView("appeals")}>发起申诉</Button>
        {role === "employee" ? <Button className="demo-wide-button" onClick={() => setView("advance")}>员工借支申请</Button> : null}
        {role === "employee" ? <Button className="demo-wide-button" onClick={() => setView("contracts")}>电子合同签署</Button> : null}
      </DemoSection>
    </>
  );

  const content = view === "jobs" ? renderJobs() : view === "people" ? renderPeople() : view === "detail" ? renderDetail() : view === "blacklist" ? renderDetail() : view === "appeals" ? renderAppeals() : view === "advance" ? renderAdvance() : view === "salary" ? renderSalary() : view === "contracts" ? renderContracts() : view === "mine" ? renderMine() : renderHome();

  return (
    <View className="demo-page">
      <View className="demo-top">
        <Text className="demo-logo">X</Text>
        <View>
          <Text className="demo-title">祥能小程序演示</Text>
          <Text className="demo-subtitle">供应商 / 员工 / 现场 / 求职者</Text>
        </View>
      </View>
      <View className="demo-tabs">
        {(["operator", "supplier", "employee", "candidate"] as DemoRole[]).map((item) => (
          <View key={item} className={role === item ? "demo-tab demo-tab--active" : "demo-tab"} onClick={() => changeRole(item)}>
            <Text>{roleLabels[item]}</Text>
          </View>
        ))}
      </View>
      {content}
      <View className="demo-bottom-tabs">
        {navForRole(role).map(({ label, key }) => (
          <Text key={key} className={view === key ? "active" : ""} onClick={() => setView(key as DemoView)}>{label}</Text>
        ))}
      </View>
    </View>
  );
}
