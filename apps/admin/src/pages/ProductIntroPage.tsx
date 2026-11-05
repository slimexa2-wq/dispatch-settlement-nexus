import {
  ApartmentOutlined,
  ArrowRightOutlined,
  AuditOutlined,
  BarChartOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  ExperimentOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FundOutlined,
  GlobalOutlined,
  HomeOutlined,
  IdcardOutlined,
  InfoCircleOutlined,
  LaptopOutlined,
  LineChartOutlined,
  MenuFoldOutlined,
  MobileOutlined,
  NotificationOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  ScanOutlined,
  SolutionOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserSwitchOutlined
} from "@ant-design/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type PortKey = "personal" | "internal" | "supplier";

/* ------------------------------------------------------------------ */
/*  Data                                                                */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: "首页", href: "#hero" },
  { label: "业务痛点", href: "#pain-points" },
  { label: "系统展示", href: "#architecture" },
  { label: "核心流程", href: "#lifecycle" },
  { label: "AI业务助手", href: "#ai-assistant" },
  { label: "AI制作过程", href: "#ai-process" },
  { label: "优势价值", href: "#values" },
  { label: "在线演示", href: "#demo-cta" }
] as const;

const PAIN_POINTS = [
  {
    icon: <BarChartOutlined />,
    title: "数据不直观",
    desc: "领导查看各分公司和项目情况时，部分数据仍需要导出、汇总和二次计算。"
  },
  {
    icon: <FileTextOutlined />,
    title: "重复填报",
    desc: "运营办理人员业务后，还需要维护人员表、日报、周报及其他台账。"
  },
  {
    icon: <TeamOutlined />,
    title: "协同依赖人工",
    desc: "求职者、员工和供应商仍大量依靠微信、电话询问状态和进度。"
  },
  {
    icon: <FundOutlined />,
    title: "成本与定制受限",
    desc: "第三方系统需要持续支付费用，且标准化功能无法完全适应祥能实际业务。"
  }
];

const COMPARISON_ROWS = [
  { dim: "产品定位", old: "面向行业的通用平台", new: "围绕祥能业务定制" },
  { dim: "数据查看", old: "部分数据需导出后二次处理", new: "按分公司、项目和时间直接筛选" },
  { dim: "运营工作", old: "系统与外部表格并行", new: "业务状态更新后自动形成数据" },
  { dim: "招聘协同", old: "招聘端尚未形成完整闭环", new: "个人、内部和供应商三端联动" },
  { dim: "定制能力", old: "受标准产品和开发周期限制", new: "可根据业务持续调整" },
  { dim: "数据管理", old: "依赖第三方平台", new: "公司自主掌握和管理" },
  { dim: "成本结构", old: "持续年度服务费用", new: "长期综合成本更可控" }
];

const ARCH_MODULES_LEFT = [
  { icon: <IdcardOutlined />, label: "人员档案" },
  { icon: <ApartmentOutlined />, label: "项目管理" },
  { icon: <ProfileOutlined />, label: "岗位需求" },
  { icon: <TeamOutlined />, label: "供应商管理" }
];

const ARCH_MODULES_RIGHT = [
  { icon: <SafetyCertificateOutlined />, label: "政策管理" },
  { icon: <FundOutlined />, label: "工资与结算" },
  { icon: <FundOutlined />, label: "报销闭环" },
  { icon: <BarChartOutlined />, label: "领导驾驶舱" },
  { icon: <ExperimentOutlined />, label: "AI业务助手" },
  { icon: <NotificationOutlined />, label: "消息通知" },
  { icon: <LockOutlined />, label: "权限与审计" }
];

function LockOutlined(props?: Record<string, unknown>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1em" height="1em" fill="currentColor" {...props}>
      <path d="M832 464V320c0-159-129-288-288-288S256 161 256 320v144H224c-17.7 0-32 14.3-32 32v416c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V496c0-17.7-14.3-32-32-32h-32zM320 320c0-123.7 100.3-224 224-224s224 100.3 224 224v144H320V320zm360 368H344c-4.4 0-8-3.6-8-8v-72c0-4.4 3.6-8 8-8h336c4.4 0 8 3.6 8 8v72c0 4.4-3.6 8-8 8z" />
    </svg>
  );
}

const SYNC_ITEMS = [
  { icon: <BarChartOutlined />, label: "领导看板" },
  { icon: <LineChartOutlined />, label: "项目进度" },
  { icon: <MobileOutlined />, label: "个人端进度" },
  { icon: <TeamOutlined />, label: "供应商状态" },
  { icon: <UserSwitchOutlined />, label: "祥能自招" },
  { icon: <IdcardOutlined />, label: "人员档案" },
  { icon: <FundOutlined />, label: "报销闭环" },
  { icon: <ExperimentOutlined />, label: "AI助手" }
];

const PORTS: Array<{
  key: PortKey;
  label: string;
  positioning: string;
  features: string[];
  image: string;
  imageAlt: string;
  deviceType: "phone" | "laptop";
}> = [
  {
    key: "personal",
    label: "个人端",
    positioning: "从求职到入职，始终使用同一个账号。",
    features: [
      "查看岗位与公告",
      "在线报名",
      "查看报名进度",
      "推荐和转发岗位",
      "工资条",
      "借支申请",
      "工资申诉",
      "推荐奖励"
    ],
    image: "/product-assets/miniapp-employee.png",
    imageAlt: "员工个人端界面",
    deviceType: "phone"
  },
  {
    key: "internal",
    label: "内部管理端",
    positioning: "领导和运营使用同一套界面，通过权限控制数据范围和操作能力。",
    features: [
      "工作台数据筛选",
      "人员姓名和手机号搜索",
      "按状态、项目、供应商、面试时间筛选",
      "快捷修改人员状态",
      "发布和修改岗位需求",
      "生成24小时报名二维码",
      "查看祥能自招人员"
    ],
    image: "/product-assets/admin-dashboard.png",
    imageAlt: "内部管理后台界面",
    deviceType: "laptop"
  },
  {
    key: "supplier",
    label: "供应商端",
    positioning: "看岗位、看人员、看结算。",
    features: [
      "查看岗位和供应商政策",
      "报名人员",
      "查看自己输送人员状态",
      "查看入职、离职和在职时长",
      "查看月度结算",
      "提交人员或结算申诉"
    ],
    image: "/product-assets/miniapp-supplier.png",
    imageAlt: "供应商端界面",
    deviceType: "phone"
  }
];

const LIFECYCLE_STEPS = [
  { num: "01", title: "报名", sub: "登记基础信息", icon: <SolutionOutlined /> },
  { num: "02", title: "面试", sub: "记录结果与时间", icon: <UserSwitchOutlined /> },
  { num: "03", title: "待入职", sub: "核验入职资料", icon: <FileTextOutlined /> },
  { num: "04", title: "入职", sub: "办理入职并同步", icon: <IdcardOutlined /> },
  { num: "05", title: "在职", sub: "在职管理与服务", icon: <LaptopOutlined /> },
  { num: "06", title: "离职", sub: "离职留档", icon: <AuditOutlined /> }
];

const AI_STEPS = [
  { num: "1", title: "发现业务痛点", desc: "从实际场景中发现问题，明确核心问题与用户需求", icon: <BulbOutlined /> },
  { num: "2", title: "ChatGPT探需与核对", desc: "深入探讨论需求，补充细节，确认业务逻辑与边界", icon: <ExperimentOutlined /> },
  { num: "3", title: "AI Studio快速原型", desc: "快速生成系统原型，验证整体结构与功能流程", icon: <DesktopOutlined /> },
  { num: "4", title: "UI效果图像生成", desc: "生成多端高保真界面参考图，优化用户体验", icon: <FileImageOutlined /> },
  { num: "5", title: "需求文档整理", desc: "沉淀需求说明、功能清单与交互图，形成标准文档", icon: <FileTextOutlined /> },
  { num: "6", title: "Codex代码搭建", desc: "根据需求文档开发核心功能，搭建系统与接口", icon: <CodeOutlined /> },
  { num: "7", title: "真实操作测试", desc: "按运营实际流程测试功能，发现问题、记录测试结果", icon: <PlayCircleOutlined /> },
  { num: "8", title: "持续修改迭代", desc: "持续优化功能与体验，完善细节，提升系统质量", icon: <ToolOutlined /> }
];

const AI_TOOLS = [
  {
    name: "ChatGPT",
    color: "#10a37f",
    bg: "linear-gradient(135deg,#10a37f,#0d8a6a)",
    items: ["需求梳理", "业务建模", "文档与提示词"]
  },
  {
    name: "AI Studio",
    color: "#1677ff",
    bg: "linear-gradient(135deg,#1677ff,#0958d9)",
    items: ["快速生成系统预览", "验证结构方向", "原型初步呈现"]
  },
  {
    name: "图像生成",
    color: "#722ed1",
    bg: "linear-gradient(135deg,#722ed1,#531dab)",
    items: ["多端UI参考", "高保真视觉", "页面展示素材"]
  },
  {
    name: "Codex",
    color: "#1a1a2e",
    bg: "linear-gradient(135deg,#2d2d44,#1a1a2e)",
    items: ["后台与小程序开发", "功能落地", "修改与迭代"]
  }
];

const VALUE_CARDS = [
  {
    role: "对领导",
    icon: <ProfileOutlined />,
    points: ["数据直观、筛选方便", "减少等待报表", "快速掌握项目情况"]
  },
  {
    role: "对运营",
    icon: <ThunderboltOutlined />,
    points: ["少填报、快查询", "快改状态", "现场报名更高效"]
  },
  {
    role: "对员工/求职者",
    icon: <MobileOutlined />,
    points: ["报名、推荐、工资集中", "进度可查、消息及时", "减少反复询问"]
  },
  {
    role: "对供应商",
    icon: <ApartmentOutlined />,
    points: ["岗位、政策透明", "人员状态透明", "结算明细透明、在线申诉"]
  },
  {
    role: "对公司",
    icon: <GlobalOutlined />,
    points: ["长期成本可控", "数据自主掌握", "可持续定制、形成数字资产"]
  }
];

const WORKFLOW_COMPARISONS = [
  {
    title: "查询员工资料",
    old: "找文件 → 翻表格 → 核对多个来源",
    new: "输入姓名或手机号 → 直接查看完整档案"
  },
  {
    title: "统计在职人数",
    old: "多表汇总 → 人工计算 → 反复核验",
    new: "人员状态更新 → 工作台自动汇总"
  },
  {
    title: "现场报名",
    old: "纸质登记 → 运营再次录入系统",
    new: "扫描项目二维码 → 自动带出项目和当天面试日期"
  },
  {
    title: "供应商查询人员状态",
    old: "微信询问 → 运营查找 → 人工回复",
    new: "供应商端自行查看实时状态"
  }
];

const DEMO_ROLES = [
  { label: "领导演示", icon: <ProfileOutlined />, desc: "全局数据与决策视角" },
  { label: "运营演示", icon: <ThunderboltOutlined />, desc: "现场办理与状态流转" },
  { label: "员工/求职者演示", icon: <MobileOutlined />, desc: "个人服务与推荐功能" },
  { label: "供应商演示", icon: <ApartmentOutlined />, desc: "岗位报人与结算查看" }
];

const ROADMAP = [
  { icon: <RocketOutlined />, title: "生产发布", desc: "容器化部署、健康检查与故障恢复" },
  { icon: <MobileOutlined />, title: "微信上架", desc: "已编译小程序提交审核并配置业务域名" },
  { icon: <DatabaseOutlined />, title: "正式迁移", desc: "历史数据校验、分批迁移与结果对账" },
  { icon: <LineChartOutlined />, title: "运营推广", desc: "权限培训、试点运行与持续优化" }
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SectionHeading({ children, description, id }: { children: ReactNode; description?: string; id?: string }) {
  return (
    <div className="pp-section-heading" {...(id ? { id } : {})}>
      <h2>{children}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

function ProductBrand() {
  return (
    <Link className="pp-brand" to="/product">
      <span className="pp-brand-mark">X</span>
      <span>祥能人员与招聘信息管理系统</span>
    </Link>
  );
}

/**
 * DeviceFrame — 统一的设备外壳组件
 * 将原始截图包装在一致的设备框中（浏览器框 / 手机框），
 * 通过 object-fit + object-position 裁剪到最佳区域。
 */
function DeviceFrame({
  src,
  alt,
  type = "laptop",
  label,
  objectPosition = "center"
}: {
  src: string;
  alt: string;
  type?: "laptop" | "phone";
  label?: string;
  objectPosition?: string;
}) {
  return (
    <figure className={`pp-device pp-device-${type}`}>
      <div className="pp-device-chrome">
        {type === "laptop" ? (
          <>
            <span className="pp-dots">
              <i /><i /><i />
            </span>
            <span className="pp-dots-url" />
          </>
        ) : (
          <>
            <span className="pp-phone-notch" />
            <span className="pp-phone-time">9:41</span>
            <span className="pp-phone-icons">
              <i /><i /><i />
            </span>
          </>
        )}
      </div>
      <img src={src} alt={alt} style={{ objectPosition }} />
      {label ? <figcaption className="pp-device-label">{label}</figcaption> : null}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export function ProductIntroPage() {
  const [activePort, setActivePort] = useState<PortKey>("personal");
  const [navOpen, setNavOpen] = useState(false);
  const [activeNavIndex, setActiveNavIndex] = useState(0);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const location = useLocation();

  /* scroll-spy */
  useEffect(() => {
    const ids = NAV_ITEMS.map((item) => item.href.slice(1));
    const observers: IntersectionObserver[] = [];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      sectionRefs.current[id] = el;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            const idx = ids.indexOf(id);
            if (idx >= 0) setActiveNavIndex(idx);
          }
        },
        { rootMargin: "-20% 0px -60% 0px", threshold: 0.1 }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  /* reset scroll on mount */
  useEffect(() => {
    if (location.hash) {
      setTimeout(() => {
        document.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [location.hash]);

  const handleNavClick = (href: string) => {
    setNavOpen(false);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  const currentPort = PORTS.find((p) => p.key === activePort) ?? PORTS[0]!;

  return (
    <main className="pp">
      {/* ===== 00 Fixed Nav ===== */}
      <header className="pp-header">
        <div className="pp-container pp-header-inner">
          <ProductBrand />
          <button className="pp-nav-toggle" type="button" onClick={() => setNavOpen(!navOpen)} aria-label="切换导航菜单">
            <MenuFoldOutlined />
          </button>
          <nav className={`pp-nav ${navOpen ? "is-open" : ""}`} aria-label="页面导航">
            {NAV_ITEMS.map((item, i) => (
              <button
                key={item.href}
                type="button"
                className={i === activeNavIndex ? "is-active" : ""}
                onClick={() => handleNavClick(item.href)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <Link className="pp-btn pp-btn-primary" to="/login">
            进入系统演示 <ArrowRightOutlined />
          </Link>
        </div>
      </header>

      {/* ===== 01 Hero ===== */}
      <section className="pp-hero" id="hero">
        <div className="pp-hero-bg" aria-hidden="true" />
        <div className="pp-container pp-hero-grid">
          <div className="pp-hero-copy">
            <h1>一套数据，贯通招聘与人员全流程</h1>
            <p className="pp-hero-sub">桌面管理后台 + 手机小程序 + 本地 Qwen AI 业务助手</p>
            <p className="pp-hero-desc">
              连接公司管理层、业务运营人员、在职员工、求职者及供应商，让人员、招聘、项目、政策和结算信息在同一套系统中流转。
            </p>
            <p className="pp-hero-ai">
              Qwen3.5 4B 通过 Ollama 在本地运行，可自由提问并检索权限范围内的真实业务数据；入职、离职操作必须预览确认，再由正式服务事务执行。
            </p>
            <div className="pp-hero-actions">
              <Link className="pp-btn pp-btn-primary pp-btn-lg" to="/login">
                <DesktopOutlined /> 查看系统演示 <ArrowRightOutlined />
              </Link>
              <button className="pp-btn pp-btn-ghost pp-btn-lg" type="button" onClick={() => handleNavClick("#ai-process")}>
                <ExperimentOutlined /> 了解制作过程
              </button>
            </div>
          </div>
          <div className="pp-hero-visual" aria-label="系统界面预览">
            <DeviceFrame
              src="/product-assets/admin-dashboard.png"
              alt="管理后台界面"
              type="laptop"
              label="数据管理后台"
              objectPosition="center"
            />
            <div className="pp-hero-phones">
              <DeviceFrame
                src="/product-assets/miniapp-employee.png"
                alt="员工个人端"
                type="phone"
                label="员工 / 求职者端"
                objectPosition="center"
              />
              <DeviceFrame
                src="/product-assets/miniapp-supplier.png"
                alt="供应商端"
                type="phone"
                label="供应商端"
                objectPosition="center"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== 02 Pain Points ===== */}
      <section className="pp-section pp-pain-points" id="pain-points">
        <div className="pp-container">
          <SectionHeading description="现有系统有功能，但真实问题仍未完全解决">
            为什么要做：现有工作痛点
          </SectionHeading>
          <div className="pp-cards-grid pp-cards-4">
            {PAIN_POINTS.map((item) => (
              <article key={item.title} className="pp-card">
                <span className="pp-card-icon">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 03 Comparison Table ===== */}
      <section className="pp-section pp-comparison" id="comparison">
        <div className="pp-container">
          <SectionHeading>与伯仕系统对比</SectionHeading>
          <div className="pp-table-wrap">
            <table className="pp-compare-table">
              <thead>
                <tr>
                  <th>对比维度</th>
                  <th>伯仕系统</th>
                  <th>祥能新系统</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.dim}>
                    <td className="pp-td-dim">{row.dim}</td>
                    <td className="pp-td-old">{row.old}</td>
                    <td className="pp-td-new">{row.new}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pp-compare-note">
            伯仕解决行业通用问题，新系统重点解决祥能自身的人员与招聘管理问题。
          </p>
        </div>
      </section>

      {/* ===== 04 Architecture ===== */}
      <section className="pp-section pp-arch" id="architecture">
        <div className="pp-container">
          <SectionHeading description="以数据管理后台为核心，打通业务全流程，实现信息共享、状态同步、协同高效。">
            系统整体架构：一套数据，三个端口，多方协同
          </SectionHeading>
          <div className="pp-arch-diagram">
            <div className="pp-arch-left">
              {ARCH_MODULES_LEFT.map((m) => (
                <div key={m.label} className="pp-arch-module"><span>{m.icon}</span><strong>{m.label}</strong></div>
              ))}
            </div>
            <div className="pp-arch-center">
              <div className="pp-arch-hub">
                <DatabaseOutlined />
                <strong>数据管理后台</strong>
              </div>
            </div>
            <div className="pp-arch-right">
              {ARCH_MODULES_RIGHT.map((m) => (
                <div key={m.label} className="pp-arch-module"><span>{m.icon}</span><strong>{m.label}</strong></div>
              ))}
            </div>
          </div>
          <div className="pp-sync-rail">
            <div className="pp-sync-label">一次状态更新，多端同步</div>
            <div className="pp-sync-items">
              {SYNC_ITEMS.map((s) => (
                <div key={s.label} className="pp-sync-item"><span>{s.icon}</span><span>{s.label}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== 05 Three Ports Showcase ===== */}
      <section className="pp-section pp-ports" id="ports">
        <div className="pp-container">
          <SectionHeading description="三个端口共用同一套数据，角色不同看到的内容和操作也不同。">
            三端口展示
          </SectionHeading>
          <div className="pp-port-tabs" role="tablist">
            {PORTS.map((port) => (
              <button
                key={port.key}
                type="button"
                role="tab"
                aria-selected={port.key === activePort}
                className={port.key === activePort ? "is-active" : ""}
                onClick={() => setActivePort(port.key)}
              >
                {port.label}
              </button>
            ))}
          </div>
          <div className="pp-port-panel" role="tabpanel">
            <div className="pp-port-info">
              <p className="pp-port-positioning">{currentPort.positioning}</p>
              <ul className="pp-port-features">
                {currentPort.features.map((f) => (
                  <li key={f}><CheckCircleOutlined /> {f}</li>
                ))}
              </ul>
              <Link className="pp-btn pp-btn-primary" to="/login">
                查看{currentPort.label} <ArrowRightOutlined />
              </Link>
            </div>
            <div className="pp-port-visual">
              <DeviceFrame
                src={currentPort.image}
                alt={currentPort.imageAlt}
                type={currentPort.deviceType}
                objectPosition="center"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== 06 Lifecycle ===== */}
      <section className="pp-section pp-lifecycle" id="lifecycle">
        <div className="pp-container">
          <SectionHeading description="覆盖从报名到离职的完整生命周期，信息全程留痕，数据实时同步，业务衔接更顺畅。">
            核心业务闭环：一人一档，全流程记录
          </SectionHeading>
          <div className="pp-lifecycle-rail">
            {LIFECYCLE_STEPS.map((step) => (
              <div key={step.num} className="pp-lc-step">
                <div className="pp-lc-num">{step.num}</div>
                <div className="pp-lc-icon">{step.icon}</div>
                <strong>{step.title}</strong>
                <span>{step.sub}</span>
              </div>
            ))}
          </div>
          <div className="pp-lc-showcase">
            <div className="pp-lc-col">
              <div className="pp-lc-col-head"><MobileOutlined /> 个人端关键体验</div>
              <div className="pp-lc-col-body">
                <DeviceFrame
                  src="/product-assets/miniapp-employee.png"
                  alt="个人端"
                  type="phone"
                  objectPosition="center"
                />
                <ul className="pp-lc-feats">
                  <li><CheckCircleOutlined /> 首页岗位与公告</li>
                  <li><CheckCircleOutlined /> 查看报名进度</li>
                  <li><CheckCircleOutlined /> 推荐好友</li>
                  <li><CheckCircleOutlined /> 工资条 / 借支 / 申诉</li>
                </ul>
              </div>
            </div>
            <div className="pp-lc-col">
              <div className="pp-lc-col-head"><DesktopOutlined /> 内部管理端关键体验</div>
              <div className="pp-lc-col-body">
                <DeviceFrame
                  src="/product-assets/admin-dashboard.png"
                  alt="管理后台"
                  type="laptop"
                  objectPosition="center"
                />
                <ul className="pp-lc-feats">
                  <li><CheckCircleOutlined /> 分公司 / 项目 / 时间筛选</li>
                  <li><CheckCircleOutlined /> 姓名 / 手机号搜索</li>
                  <li><CheckCircleOutlined /> 状态快捷修改</li>
                  <li><CheckCircleOutlined /> 项目需管理 + 二维码</li>
                </ul>
              </div>
            </div>
            <div className="pp-lc-col">
              <div className="pp-lc-col-head"><ApartmentOutlined /> 供应商端关键体验</div>
              <div className="pp-lc-col-body">
                <DeviceFrame
                  src="/product-assets/miniapp-supplier.png"
                  alt="供应商端"
                  type="phone"
                  objectPosition="center"
                />
                <ul className="pp-lc-feats">
                  <li><CheckCircleOutlined /> 岗位与政策</li>
                  <li><CheckCircleOutlined /> 我的人员状态</li>
                  <li><CheckCircleOutlined /> 在职天数</li>
                  <li><CheckCircleOutlined /> 结算与申诉</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="pp-vs-bar">
            <div className="pp-vs-left">
              <FileTextOutlined />
              <div>
                <strong>旧方式：多表查找</strong>
                <span>多系统导出、手动汇总、耗时费力</span>
              </div>
            </div>
            <div className="pp-vs-sep">VS</div>
            <div className="pp-vs-right">
              <CheckCircleOutlined />
              <div>
                <strong>新方式：筛选后直接导出</strong>
                <span>一键导出所需数据、准确高效</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 07 Embedded AI Assistant ===== */}
      <section className="pp-section pp-embedded-ai" id="ai-assistant">
        <div className="pp-container pp-embedded-ai-grid">
          <div className="pp-embedded-ai-copy">
            <span className="pp-kicker"><ExperimentOutlined /> 新增核心能力</span>
            <h2>祥能 AI 业务助手，不是固定回复的聊天框</h2>
            <p>助手直接连接统一业务数据与权限体系。模型负责理解自然语言，程序负责查数、校验、预览、事务执行与审计；即使本地模型临时不可用，传统页面和标准表单仍可继续工作。</p>
            <div className="pp-embedded-ai-capabilities">
              {[
                [<DatabaseOutlined />, "自由数据问答", "查询项目、人员、岗位、供应商、招聘进度和统计口径"],
                [<ProfileOutlined />, "完整业务信息", "在授权范围内返回完整手机号、身份证号与联系人信息"],
                [<UserSwitchOutlined />, "权限内业务操作", "支持单人入职、单人离职，先预览再确认"],
                [<SafetyCertificateOutlined />, "安全可追溯", "后端权限过滤、事务、幂等与审计日志全覆盖"]
              ].map(([icon, title, desc]) => <article key={String(title)}><span>{icon}</span><div><strong>{title}</strong><p>{desc}</p></div></article>)}
            </div>
            <div className="pp-hero-actions">
              <Link className="pp-btn pp-btn-primary" to="/login">进入桌面管理后台 <ArrowRightOutlined /></Link>
              <a className="pp-btn pp-btn-ghost" href="http://localhost:4320/entry" target="_blank" rel="noreferrer">打开手机小程序 <MobileOutlined /></a>
            </div>
          </div>
          <div className="pp-embedded-ai-console" aria-label="祥能AI业务助手能力演示">
            <div className="pp-ai-console-head"><span><ExperimentOutlined /></span><div><strong>祥能AI业务助手</strong><small>Qwen3.5 4B · Ollama 本地运行</small></div><em>运行正常</em></div>
            <div className="pp-ai-console-body">
              <div className="pp-ai-user">祥能智造示范项目有哪些招聘岗位？负责人电话是多少？</div>
              <div className="pp-ai-answer"><strong>已按系统管理员权限检索演示业务库</strong><p>返回操作工、仓库管理员的薪资、要求和招聘缺口；项目负责人演示负责人1，电话10000000301。演示数据快照日期 2026-07-26。</p></div>
              <div className="pp-ai-preview"><span>写操作安全链路</span><b>自然语言 → 操作预览 → 用户确认 → 事务执行 → 审计日志</b></div>
            </div>
            <div className="pp-ai-console-foot"><DatabaseOutlined /> 统一数据源 <ThunderboltOutlined /> 断网核心能力可运行 <SafetyCertificateOutlined /> 权限受控</div>
          </div>
        </div>
      </section>

      {/* ===== 08 AI Process —— 重点模块 ===== */}
      <section className="pp-section pp-ai-process" id="ai-process">
        <div className="pp-container">
          <SectionHeading description="借助多款 AI 工具协同配合，高效完成系统从需求梳理、原型设计到代码实现的全流程，让创意快速变为可演示、可落地的真实作品。">
            AI 制作过程：从业务想法到可演示系统
          </SectionHeading>
          <div className="pp-ai-steps">
            {AI_STEPS.map((step) => (
              <div key={step.num} className="pp-ai-step">
                <div className="pp-ai-step-num">{step.num}</div>
                <div className="pp-ai-step-icon">{step.icon}</div>
                <strong>{step.title}</strong>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="pp-ai-tools-grid">
            <div className="pp-ai-tools-left">
              {AI_TOOLS.map((tool) => (
                <article key={tool.name} className="pp-ai-tool-card">
                  <div className="pp-ai-tool-icon" style={{ background: tool.bg }}>
                    {tool.name === "Codex" ? <CodeOutlined /> : tool.name === "图像生成" ? <FileImageOutlined /> : tool.name === "AI Studio" ? <DesktopOutlined /> : <ExperimentOutlined />}
                  </div>
                  <h4>{tool.name}</h4>
                  <p>{tool.name === "ChatGPT" ? "需求分析与方案设计" : tool.name === "AI Studio" ? "原型生成与结构验证" : tool.name === "图像生成" ? "界面设计与视觉呈现" : "代码开发与功能实现"}</p>
                  <ul>
                    {tool.items.map((t) => (<li key={t}><CheckCircleOutlined /> {t}</li>))}
                  </ul>
                </article>
              ))}
            </div>
            <div className="pp-ai-tools-right">
              <div className="pp-ai-iteration">
                <h4>真实迭代</h4>
                <div className="pp-iter-loop">
                  {["发现问题", "明确修改", "Codex修复", "再次验证"].map((label, i) => (
                    <div key={label} className="pp-iter-node">
                      <span className="pp-iter-icon">{i === 0 ? <ScanOutlined /> : i === 1 ? <EditOutlined /> : i === 2 ? <CodeOutlined /> : <SafetyCertificateOutlined />}</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pp-ai-deliverables">
                <h4>关键成果</h4>
                <div className="pp-deliver-cards">
                  {[
                    { icon: <FileTextOutlined />, title: "需求文档", sub: "完整需求说明\n与功能清单" },
                    { icon: <FileImageOutlined />, title: "UI 原型", sub: "高保真界面图\n与交互流程" },
                    { icon: <DesktopOutlined />, title: "系统演示", sub: "可操作系统\n演示版本" },
                    { icon: <FundOutlined />, title: "参赛作品", sub: "完整作品提交\n与展示材料" }
                  ].map((d) => (
                    <div key={d.title} className="pp-deliver-card">
                      <span>{d.icon}</span>
                      <strong>{d.title}</strong>
                      <span>{d.sub}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="pp-ai-summary">AI 负责快速产出，业务人员负责判断、校验和纠偏。</p>
        </div>
      </section>

      {/* ===== 08 Values ===== */}
      <section className="pp-section pp-values" id="values">
        <div className="pp-container">
          <SectionHeading>为什么值得使用：优势、价值与演示入口</SectionHeading>
          <div className="pp-value-cards">
            {VALUE_CARDS.map((vc) => (
              <article key={vc.role} className="pp-value-card">
                <span className="pp-value-icon">{vc.icon}</span>
                <h3>{vc.role}</h3>
                <ul>
                  {vc.points.map((pt) => (<li key={pt}><CheckCircleOutlined /> {pt}</li>))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 09 Workflow Comparison ===== */}
      <section className="pp-section pp-workflow" id="workflow">
        <div className="pp-container">
          <SectionHeading>新旧流程对比</SectionHeading>
          <div className="pp-wf-list">
            {WORKFLOW_COMPARISONS.map((wf) => (
              <div key={wf.title} className="pp-wf-row">
                <div className="pp-wf-title">
                  <InfoCircleOutlined /> {wf.title}
                </div>
                <div className="pp-wf-old">
                  <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
                  <div>
                    <strong>当前方式</strong>
                    <span>{wf.old}</span>
                  </div>
                </div>
                <div className="pp-wf-arrow"><ArrowRightOutlined /></div>
                <div className="pp-wf-new">
                  <CheckCircleOutlined style={{ color: "#52c41a" }} />
                  <div>
                    <strong>新系统方式</strong>
                    <span>{wf.new}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 10 Demo CTA ===== */}
      <section className="pp-demo-cta" id="demo-cta">
        <div className="pp-container pp-demo-inner">
          <div className="pp-demo-copy">
            <h2>在线演示：进入完整系统体验</h2>
            <p>选择不同角色视角，沉浸式体验系统功能与价值</p>
            <div className="pp-demo-roles">
              {DEMO_ROLES.map((role) => (
                <Link key={role.label} className="pp-demo-role-btn" to="/login">
                  <span>{role.icon}</span>
                  <strong>{role.label}</strong>
                  <span>{role.desc}</span>
                </Link>
              ))}
            </div>
            <Link className="pp-btn pp-btn-light pp-btn-lg" to="/login">
              开始完整演示体验 <ArrowRightOutlined />
            </Link>
            <p className="pp-demo-flow">
              推荐演示链路：<br />
              新人员报名 → 运营修改状态 → 办理入职 → 领导数据更新 → 个人端更新 → 供应商端更新
            </p>
          </div>
        </div>
      </section>

      {/* ===== 11 Roadmap ===== */}
      <section className="pp-section pp-roadmap" id="roadmap">
        <div className="pp-container">
          <SectionHeading>后续落地计划</SectionHeading>
          <div className="pp-roadmap-cards">
            {ROADMAP.map((rm) => (
              <article key={rm.title} className="pp-roadmap-card">
                <span className="pp-rm-icon">{rm.icon}</span>
                <h4>{rm.title}</h4>
                <p>{rm.desc}</p>
              </article>
            ))}
          </div>
          <p className="pp-roadmap-note">
            当前参赛版本已具备完整 PC 管理后台、手机小程序、领导驾驶舱、报销闭环和本地 AI 助手；正式落地只需按环境脚本配置服务器、数据库、COS、域名与微信审核信息。
          </p>
        </div>
      </section>

      {/* ===== 12 Footer ===== */}
      <footer className="pp-footer">
        <div className="pp-container pp-footer-inner">
          <ProductBrand />
          <div className="pp-footer-info">
            <span>四川祥能人力资本服务有限公司</span>
            <span className="pp-footer-tag">AI 工具应用大赛参赛作品</span>
          </div>
          <div className="pp-footer-actions">
            <button className="pp-btn pp-btn-ghost pp-btn-sm" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              返回顶部 <HomeOutlined />
            </button>
            <Link className="pp-btn pp-btn-primary pp-btn-sm" to="/login">
              进入系统演示 <ArrowRightOutlined />
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline icon for missing antd icon                                      */
/* ------------------------------------------------------------------ */

function EditOutlined(props?: Record<string, unknown>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1em" height="1em" fill="currentColor" {...props}>
      <path d="M257.7 752c2 0 4-.2 5.9-.5L426 709.1c4-1.1 7.7-3.3 10.7-6.3l429.3-429.3c25-25 25-65.5 0-90.5l-90.4-90.4c-25-25-65.5-25-90.5 0L455.8 618.2c-3 3-5.2 6.7-6.3 10.7L406.5 760.4c-2.3 8.3.9 17 7.7 21.4 4.2 2.5 8.9 3.3 13.5 2.2zM476.7 600.2l273.1-273.1 52.8 52.8-273.1 273.1-52.8-52.8z" />
    </svg>
  );
}

function CloseCircleOutlined(props?: Record<string, unknown>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1em" height="1em" fill="currentColor" {...props}>
      <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm165.4 618.2l-66-.3L512 563.4l-99.3 118.4-66.1.3c-17.4 0-32-14.3-32-32-.1-18 14.3-32.6 32.3-32.7l50-.2 49.7-59.3-49.7-59.2-50-.2c-18-.1-32.4-14.7-32.3-32.7.1-17.7 14.5-32 32-32l66.1.3L512 416.6l99.3-118.5 66-.3c17.4 0 32 14.3 32 32 .1 18-14.3 32.6-32.3 32.7l-50 .2-49.7 59.3 49.7 59.2 50 .2c18 .1 32.4 14.7 32.3 32.7-.1 17.7-14.5 32-32 32z" />
    </svg>
  );
}
