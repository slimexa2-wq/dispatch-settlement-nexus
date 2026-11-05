# 项目人员数据查询 Skill

## Skill ID
`project_personnel_statistics`

## 目标
按权限查询项目或分公司的入职、离职、当前在职和净增减。

## 典型触发
- 每月入职人数
- 每月离职人数
- 当前在职人数
- 人员净增减
- 上半年入职情况

## 禁止误触发
- 给张三办理入职
- 把张三改成在职
- 给张三办理离职

## 必填参数
- `metric`

## 可选参数
- `project_name`
- `branch_name`
- `start_date`
- `end_date`
- `group_by`

## 权限
只能查询当前账号权限范围内的分公司、项目或聚合数据。

## 工具
- `get_project_personnel_statistics`

## 标准流程
1. 识别意图和参数；
2. 解析项目、人员和日期；
3. 校验 Schema；
4. 校验当前登录用户权限；
5. 校验业务规则；
6. 查询直接执行，写操作仅生成预览；
7. 写操作收到用户确认后通过正式服务提交；
8. 返回结构化结果并写审计日志。

## 业务校验
- metric 仅允许 hire_count、resignation_count、current_headcount、net_change
- 入职按 entry_date，离职按 resignation_date
- 项目重名必须选择
- 结果必须返回口径、范围和更新时间

## 失败处理
- 未找到：明确返回未找到；
- 多个实体：返回脱敏候选；
- 缺参：只询问缺少项；
- 无权限：后端拒绝，不允许模型绕过；
- 模型异常：切换标准表单；
- 写操作超时：查询 action 状态，不盲目重复执行。
