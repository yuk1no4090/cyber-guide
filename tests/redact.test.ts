import { describe, it, expect } from 'vitest';
import { redact } from '../src/lib/redact';

describe('redact - 数据脱敏', () => {
  it('应该替换手机号', () => {
    expect(redact('我的号码是13812345678')).toContain('[PHONE]');
    expect(redact('打13912345678联系我')).toContain('[PHONE]');
  });

  it('应该替换邮箱', () => {
    expect(redact('邮箱test@example.com')).toContain('[EMAIL]');
    expect(redact('发到 zhangsan@qq.com')).toContain('[EMAIL]');
  });

  it('应该替换身份证号', () => {
    expect(redact('身份证110101199001011234')).toContain('[ID_CARD]');
  });

  it('不应该改变普通文本', () => {
    const text = '我最近压力很大，想聊聊';
    expect(redact(text)).toBe(text);
  });

  it('应该同时替换多种敏感信息', () => {
    const input = '我叫张小明，手机13800138000，邮箱zm@test.com';
    const result = redact(input);
    expect(result).toContain('[PHONE]');
    expect(result).toContain('[EMAIL]');
    expect(result).not.toContain('13800138000');
    expect(result).not.toContain('zm@test.com');
  });
});

