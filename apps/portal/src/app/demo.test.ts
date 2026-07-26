// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import type { Job, Person, Session } from './types';
import { handlePortalDemoRequest, resetPortalDemo } from './demo';

describe('小程序断网演示业务层', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    resetPortalDemo();
    await handlePortalDemoRequest<Session>('/api/session/select-persona', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'operator' })
    });
  });

  it('供应商岗位可以打开完整详情并筛选人员', async () => {
    await handlePortalDemoRequest<Session>('/api/session/select-persona', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'supplier' })
    });
    const jobs = await handlePortalDemoRequest<Job[]>('/api/jobs?status=recruiting');
    const detail = await handlePortalDemoRequest<Job>(`/api/jobs/${jobs[0]?.id}`);
    const people = await handlePortalDemoRequest<Person[]>(`/api/people?projectId=${detail.project_id}`);

    expect(jobs.length).toBeGreaterThan(0);
    expect(detail.projectDescription).toContain('全流程');
    expect(detail.managerPhone).toMatch(/^\d{11}$/);
    expect(people.length).toBeGreaterThan(0);
    expect(people[0]?.idCard).toHaveLength(18);
  });

  it('现场运营修改人员状态后详情与生命周期同步更新', async () => {
    const people = await handlePortalDemoRequest<Person[]>('/api/people');
    const target = people.find((person) => person.status !== 'employed') ?? people[0]!;
    const updated = await handlePortalDemoRequest<Person>(`/api/people/${target.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'employed',
        onboardDate: '2026-07-26',
        insuranceStatus: '已办理',
        note: '自动化演示入职'
      })
    });
    const detail = await handlePortalDemoRequest<Person>(`/api/people/${target.id}`);

    expect(updated.status).toBe('employed');
    expect(detail.onboardDate).toBe('2026-07-26');
    expect(detail.lifecycle?.[0]?.note).toBe('自动化演示入职');
  });

  it('个人端收藏、报名和消息均可交互', async () => {
    await handlePortalDemoRequest<Session>('/api/session/select-persona', {
      method: 'POST',
      body: JSON.stringify({ personaId: 'personal' })
    });
    const jobs = await handlePortalDemoRequest<Job[]>('/api/jobs?status=recruiting');
    const toggled = await handlePortalDemoRequest<{ favorite: boolean }>(`/api/favorites/${jobs[1]?.id}`, { method: 'PUT' });
    await handlePortalDemoRequest(`/api/jobs/${jobs[0]?.id}/apply`, { method: 'POST' });
    const messages = await handlePortalDemoRequest<Array<{ title: string; isRead: boolean }>>('/api/messages');

    expect(toggled.favorite).toBe(true);
    expect(messages[0]?.title).toBe('报名提交成功');
    expect(messages[0]?.isRead).toBe(false);
  });
});
