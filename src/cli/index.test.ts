import { describe, it, expect } from 'vitest';
import { program } from './index.js';

describe('CLI program', () => {
  it('should be defined', () => {
    expect(program).toBeDefined();
    expect(program.name()).toBe('digest');
  });

  it('should have the correct commands', () => {
    const commands = program.commands.map(cmd => cmd.name());
    expect(commands).toContain('sync');
    expect(commands).toContain('contributors');
    expect(commands).toContain('reviews');
    expect(commands).toContain('export');
  });
});