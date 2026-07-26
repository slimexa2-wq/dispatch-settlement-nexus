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
    text: "分子公司和项目来自 Excel 初始化清单，保留当前在职为 0 的项目，缺失字段标记待维护。"
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
  }
];

const stages = ["岗位发布", "多入口报名", "面试跟进", "入职转在职", "工资条发布"];

const stats = [
  ["7", "分子公司"],
  ["243", "真实项目"],
  ["3", "报名入口"],
  ["1", "统一人员档案"]
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
          <p className="eyebrow">人员管理、招聘发布、供应商协同共用一个后台</p>
          <h1>把花名册和招聘过程放回同一套真实业务系统</h1>
          <p className="lead">
            面向祥能人资日常运营的演示官网。系统围绕人员主档持续更新，项目、供应商、政策和工资条都从业务明细关联和统计。
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
          <p className="eyebrow">电脑端适合批量处理，小程序适合现场操作</p>
          <h2>一个后台支撑管理端、小程序和微信触达</h2>
          <p>
            管理端负责搜索、导入导出、批量操作和统计下钻；小程序承担岗位浏览、报名、现场跟进、工资条查看和内部推荐。
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
          <h2>从岗位需求到员工工资条，数据不再断裂</h2>
          <p>
            每一步都更新同一份人员档案，招聘统计和项目人数从明细实时计算，后台卡片和图表可以下钻到人员名单。
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
          <h2>演示入口</h2>
          <p>
            官网用于展示系统定位和能力。要体验业务操作，可启动管理端和接口服务后使用测试账号登录；小程序端通过 Taro 项目预览。
          </p>
        </div>
        <div className="demo-card">
          <a className="primary-button" href="http://127.0.0.1:5173" target="_blank" rel="noreferrer">
            打开管理端演示
          </a>
          <small>默认管理端地址；若端口变化，以本地启动输出为准。</small>
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
