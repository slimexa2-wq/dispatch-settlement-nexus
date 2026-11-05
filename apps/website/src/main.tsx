import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const modules = [
  {
    title: "人员主档",
    text: "报名、面试、入职、在职和离职沿用同一份人员档案，身份证重复时进入原档案核验。"
  },
  {
    title: "招聘闭环",
    text: "岗位绑定项目，统计需求人数、报名、面试、入职和缺口，支持求职者、供应商、内推三类入口。"
  },
  {
    title: "组织项目",
    text: "分公司、项目、负责人、岗位和合作供应商形成完整主数据，项目图片、简介和联系方式可直接查看。"
  },
  {
    title: "供应商协同",
    text: "供应商只看自己的政策、需求和人员，后台能追溯报人来源、政策快照和奖励进度。"
  },
  {
    title: "工资条",
    text: "后台导入、预览、异常提示、发布和撤回，员工端只能查看本人工资条。"
  },
  {
    title: "权限与审计",
    text: "按角色、分子公司、项目和供应商做数据范围控制，关键修改保留操作日志。"
  },
  {
    title: "祥能 AI 业务助手",
    text: "本地 Qwen3.5 4B 在权限范围内检索人员、项目和招聘数据，单人入离职必须预览并由用户确认。"
  },
  {
    title: "报销与领导驾驶舱",
    text: "覆盖制单、审核、复核、出纳、支付和归档，领导端汇总人员、招聘、项目和费用口径。"
  }
];

const stages = ["岗位发布", "多入口报名", "面试跟进", "入职转在职", "员工服务", "AI 检索与受控操作"];

const stats = [
  ["3", "演示分公司"],
  ["8", "完整项目"],
  ["12", "招聘岗位"],
  ["48", "合成人员档案"]
];

function App() {
  return (
    <main>
      <header className="site-nav" aria-label="官网导航">
        <a className="brand" href="#top" aria-label="祥能人员与招聘信息管理系统首页">
          <span className="brand-mark">祥</span>
          <span>
            <strong>祥能人员与招聘信息管理系统</strong>
            <small>HRMS + Recruitment</small>
          </span>
        </a>
        <nav>
          <a href="#modules">系统能力</a>
          <a href="#workflow">业务流程</a>
          <a href="#demo">演示入口</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">PC 后台、微信小程序、本地 AI 与统一业务数据</p>
          <h1>从招聘到员工服务，一套系统完成全流程协同</h1>
          <p className="lead">
            面向祥能人资、项目运营、供应商和员工的一体化系统。人员、项目、招聘、报销、工资、推荐和本地 AI 助手使用统一权限与数据口径。
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#demo">查看演示入口</a>
            <a className="secondary-button" href="#modules">了解核心能力</a>
          </div>
          <div className="stats-strip" aria-label="初始化数据概览">
            {stats.map(([value, label]) => (
              <span key={label}>
                <strong>{value}</strong>
                <small>{label}</small>
              </span>
            ))}
          </div>
        </div>
        <div className="hero-media" aria-label="管理端仪表盘预览">
          <img src="/screenshots/dashboard-desktop.png" alt="管理端仪表盘截图" />
        </div>
      </section>

      <section className="screen-band">
        <div className="phone-preview">
          <img src="/screenshots/projects-mobile.png" alt="移动端项目列表截图" />
        </div>
        <div>
          <p className="eyebrow">电脑端适合管理，小程序适合现场和员工服务</p>
          <h2>桌面后台与手机小程序各自保持合适的交互形态</h2>
          <p>
            管理端负责搜索、导入导出、审核和统计下钻；手机端承担岗位浏览、报名、现场跟进、工资条、推荐和个人服务，两端由同一 API 联动。
          </p>
        </div>
      </section>

      <section className="section" id="modules">
        <div className="section-heading">
          <p className="eyebrow">Core Modules</p>
          <h2>演示系统已覆盖的主业务模块</h2>
        </div>
        <div className="module-grid">
          {modules.map((item) => (
            <article className="module-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow" id="workflow">
        <div className="workflow-copy">
          <p className="eyebrow">Business Flow</p>
          <h2>从岗位需求到员工服务，数据和权限不再断裂</h2>
          <p>
            每一步都更新同一份人员档案，招聘统计和项目人数从明细实时计算；AI 只通过受控业务工具查数和执行，不直接修改数据库。
          </p>
        </div>
        <ol className="timeline">
          {stages.map((stage, index) => (
            <li key={stage}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {stage}
            </li>
          ))}
        </ol>
      </section>

      <section className="proof">
        <div>
          <p className="eyebrow">权限隔离</p>
          <h2>按角色、分子公司、项目、供应商收口数据范围</h2>
          <p>
            运营人员看授权项目，供应商只看自己的人员和政策，员工只看个人工资条和推荐进度。系统保留导入结果、异常清单和关键操作日志。
          </p>
        </div>
        <img src="/screenshots/resource-scope.png" alt="资源权限范围设置截图" />
      </section>

      <section className="demo" id="demo">
        <div>
          <p className="eyebrow">Demo Entry</p>
          <h2>可交互演示入口</h2>
          <p>
            管理后台使用电脑布局；统一门户使用手机布局并可切换个人、供应商和内部管理角色。演示数据全部为完整合成数据。
          </p>
        </div>
        <div className="demo-card">
          <a className="primary-button" href="http://127.0.0.1:5173" target="_blank" rel="noreferrer">
            打开管理端演示
          </a>
          <a className="secondary-button" href="http://127.0.0.1:4320" target="_blank" rel="noreferrer">
            打开手机小程序演示
          </a>
          <small>本地默认地址；公开部署时以交付网址为准。</small>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
