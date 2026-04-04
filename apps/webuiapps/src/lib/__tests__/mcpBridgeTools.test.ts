import { describe, expect, it } from 'vitest';
import { isMcpToolName, toMcpToolName } from '../mcpBridgeTools';

describe('mcpBridgeTools', () => {
  it('builds deterministic tool names', () => {
    expect(toMcpToolName('OpenClaw Agent', 'call_xiaomei')).toBe(
      'mcp__openclaw_agent__call_xiaomei',
    );
    expect(toMcpToolName('  SERVER  ', 'Tool Name')).toBe('mcp__server__tool_name');
  });

  it('detects mcp tool prefix', () => {
    expect(isMcpToolName('mcp__alpha__beta')).toBe(true);
    expect(isMcpToolName('delegate_to_main_agent')).toBe(false);
  });
});
