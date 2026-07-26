// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IdentityEntry } from './IdentityEntry';

const personas = [
  { id: '1', name: '李明', role: 'personal', subtitle: '求职者 · 已报名', avatarSeed: 'li' },
  { id: '2', name: '刘总', role: 'group_leader', subtitle: '集团领导 · 全集团只读', avatarSeed: 'leader' },
  { id: '3', name: '张伟', role: 'site_operator', subtitle: '现场运营 · 宜宾时代项目', avatarSeed: 'ops' },
  { id: '4', name: '李经理', role: 'supplier', subtitle: '宏信人力 · A银供应商', avatarSeed: 'supplier' }
];

describe('IdentityEntry', () => {
  it('groups the three portals and reveals internal role choices', async () => {
    const user = userEvent.setup();
    render(<IdentityEntry personas={personas} loading={false} onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: /个人端/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /内部管理端/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /供应商端/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /内部管理端/ }));
    expect(screen.getByText('集团领导 · 全集团只读')).toBeInTheDocument();
    expect(screen.getByText('现场运营 · 宜宾时代项目')).toBeInTheDocument();
  });
});
