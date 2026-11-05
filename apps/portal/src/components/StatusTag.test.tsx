// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusTag } from './StatusTag';

describe('StatusTag', () => {
  it('renders consistent Chinese labels and semantic tone', () => {
    render(<StatusTag status="employed" />);
    expect(screen.getByText('已入职')).toHaveClass('status-tag--success');
  });
});
