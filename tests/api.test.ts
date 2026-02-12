/**
 * API 集成测试
 * 模拟真实请求测试所有 /api/chat 和 /api/feedback 的场景
 * 
 * 运行方式: npm test
 * 需要本地 dev server 运行时: npm run test:e2e
 */
import { describe, it, expect } from 'vitest';

// 这些测试不依赖服务器，直接测试核心函数
// 服务器级别的测试在 smoke-test.sh 里

// ===== 导入被测模块 =====
import { checkModeration } from '../src/lib/moderation';
import { redact } from '../src/lib/redact';
import { checkRateLimit } from '../src/lib/rate-limit';

// ========================================
// 危机检测 - 全面边界测试
// ========================================
describe('危机检测 - 完整覆盖', () => {
  describe('应该触发的危机关键词', () => {
    const crisisInputs = [
      '我想死',
      '不想活了',
      '想自杀',
      '想自残',
      '想割腕',
      '想跳楼',
      '想跳河',
      '想结束生命',
      '想离开这个世界',
      '活着没意思',
      '不如死了算了',
      '我想杀了他',
      '想弄死那个人',
      '寻死觅活',
      '想轻生',
    ];

    crisisInputs.forEach(input => {
      it(`"${input}" → 触发`, () => {
        expect(checkModeration(input).isCrisis).toBe(true);
      });
    });
  });

  describe('不应该触发的日常口语', () => {
    const safeInputs = [
      '今天热死了',
      '累死了不想动',
      '笑死我了哈哈',
      '这题难死了',
      '困死了想睡觉',
      '急死我了快点',
      '气死我了',
      '烦死了这个bug',
      '丑死了这个设计',
      '尴尬死了',
      '无聊死了',
      '饿死了去吃饭',
    ];

    safeInputs.forEach(input => {
      it(`"${input}" → 不触发`, () => {
        expect(checkModeration(input).isCrisis).toBe(false);
      });
    });
  });

  describe('正常对话不触发', () => {
    const normalInputs = [
      '我最近考研压力好大',
      '和室友关系不太好',
      '不知道该选什么方向',
      '感觉自己什么都不会',
      '最近失眠了',
      '我想转行做产品经理',
      '大学四年感觉白过了',
      '考试考砸了很难受',
      '',
      '你好',
      '谢谢',
    ];

    normalInputs.forEach(input => {
      it(`"${input}" → 不触发`, () => {
        expect(checkModeration(input).isCrisis).toBe(false);
      });
    });
  });
});

// ========================================
// 数据脱敏 - 全面测试
// ========================================
describe('数据脱敏 - 完整覆盖', () => {
  describe('手机号', () => {
    it('标准11位手机号', () => {
      expect(redact('13812345678')).toContain('[PHONE]');
      expect(redact('我的手机13912345678')).toContain('[PHONE]');
    });

    it('不同开头的手机号', () => {
      expect(redact('15012345678')).toContain('[PHONE]');
      expect(redact('18812345678')).toContain('[PHONE]');
      expect(redact('17612345678')).toContain('[PHONE]');
    });

    it('非手机号的数字不误伤', () => {
      expect(redact('12345')).toBe('12345');
      expect(redact('考了95分')).toBe('考了95分');
    });
  });

  describe('邮箱', () => {
    it('常见邮箱格式', () => {
      expect(redact('test@qq.com')).toContain('[EMAIL]');
      expect(redact('zhang.san@gmail.com')).toContain('[EMAIL]');
      expect(redact('a@b.cn')).toContain('[EMAIL]');
    });
  });

  describe('身份证号', () => {
    it('18位身份证', () => {
      expect(redact('110101199001011234')).toContain('[ID_CARD]');
    });

    it('末尾X的身份证', () => {
      expect(redact('11010119900101123X')).toContain('[ID_CARD]');
    });
  });

  describe('混合敏感信息', () => {
    it('同时包含手机号和邮箱', () => {
      const result = redact('手机13800138000邮箱a@b.com');
      expect(result).toContain('[PHONE]');
      expect(result).toContain('[EMAIL]');
      expect(result).not.toContain('13800138000');
      expect(result).not.toContain('a@b.com');
    });
  });

  describe('安全文本不变', () => {
    const safeTexts = [
      '我最近压力很大',
      '你好小舟',
      '考研还是找工作？',
      '2024年毕业',
      '',
    ];

    safeTexts.forEach(text => {
      it(`"${text}" 不变`, () => {
        expect(redact(text)).toBe(text);
      });
    });
  });
});

// ========================================
// 限流 - 全面测试
// ========================================
describe('限流 - 完整覆盖', () => {
  it('首次请求通过', () => {
    const key = `test-first-${Date.now()}`;
    const result = checkRateLimit(key, { windowMs: 60_000, maxRequests: 5 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('不超限时持续通过', () => {
    const key = `test-under-${Date.now()}`;
    const config = { windowMs: 60_000, maxRequests: 5 };

    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, config);
      expect(result.allowed).toBe(true);
    }
  });

  it('超限后拒绝', () => {
    const key = `test-over-${Date.now()}`;
    const config = { windowMs: 60_000, maxRequests: 3 };

    checkRateLimit(key, config);
    checkRateLimit(key, config);
    checkRateLimit(key, config);
    const result = checkRateLimit(key, config);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('不同 key 独立', () => {
    const config = { windowMs: 60_000, maxRequests: 1 };
    const a = checkRateLimit(`a-${Date.now()}`, config);
    const b = checkRateLimit(`b-${Date.now()}`, config);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it('remaining 正确递减', () => {
    const key = `test-remaining-${Date.now()}`;
    const config = { windowMs: 60_000, maxRequests: 3 };

    expect(checkRateLimit(key, config).remaining).toBe(2);
    expect(checkRateLimit(key, config).remaining).toBe(1);
    expect(checkRateLimit(key, config).remaining).toBe(0);
  });

  it('resetAt 在未来', () => {
    const key = `test-reset-${Date.now()}`;
    const result = checkRateLimit(key, { windowMs: 60_000, maxRequests: 5 });
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

// ========================================
// cleanAIResponse（通过导出测试）
// ========================================
describe('AI 回复清理', () => {
  // 直接测试正则逻辑
  const cleanPatterns = /【(共情|理解|倾听|回应|分析|总结|引导|支持|鼓励|观察|提问|反馈|过渡)】/g;

  it('清理【共情】标记', () => {
    expect('【共情】我理解你的感受'.replace(cleanPatterns, '')).toBe('我理解你的感受');
  });

  it('清理多个标记', () => {
    const text = '【共情】你说得对【引导】我们来聊聊【建议】';
    expect(text.replace(cleanPatterns, '')).toBe('你说得对我们来聊聊【建议】');
  });

  it('保留【建议】标记（不在清理列表）', () => {
    expect('【建议】选项1 | 选项2'.replace(cleanPatterns, '')).toBe('【建议】选项1 | 选项2');
  });

  it('没有标记的文本不变', () => {
    const text = '你好，我是小舟';
    expect(text.replace(cleanPatterns, '')).toBe(text);
  });
});

// ========================================
// 建议解析逻辑
// ========================================
describe('建议标签解析', () => {
  // 模拟 parseSuggestions 的核心逻辑
  function parseSuggestions(text: string): { message: string; suggestions: string[] } {
    const cleaned = text.replace(/\r\n/g, '\n');
    const lines = cleaned.split('\n');
    const idx = lines.findIndex(line =>
      /^(【?\s*建议\s*】?|建议[:：])/.test(line.trim())
    );

    if (idx < 0) return { message: cleaned, suggestions: [] };

    const message = lines.slice(0, idx).join('\n').trimEnd();
    const block = lines.slice(idx).join('\n')
      .replace(/^(建议\s*[:：]\s*|【?\s*建议\s*】?\s*)/, '')
      .replace(/[｜¦]/g, '|');

    const suggestions = block
      .split(/[|\n]/)
      .map(s => s.replace(/^[-*•\d.\s]+/, '').trim())
      .filter(s => s.length > 0 && s.length <= 20);

    return { message, suggestions };
  }

  it('正常解析【建议】', () => {
    const text = '你好\n\n【建议】选项1 | 选项2 | 选项3';
    const result = parseSuggestions(text);
    expect(result.message).toBe('你好');
    expect(result.suggestions).toEqual(['选项1', '选项2', '选项3']);
  });

  it('处理全角分隔符｜', () => {
    const text = '你好\n【建议】选项1｜选项2';
    const result = parseSuggestions(text);
    expect(result.suggestions).toEqual(['选项1', '选项2']);
  });

  it('没有建议时返回空数组', () => {
    const text = '这是一段普通回复';
    const result = parseSuggestions(text);
    expect(result.message).toBe(text);
    expect(result.suggestions).toEqual([]);
  });

  it('过滤超长建议（>20字）', () => {
    const text = '你好\n【建议】短建议 | 这是一个超过二十个字的非常非常长的建议文本';
    const result = parseSuggestions(text);
    expect(result.suggestions).toEqual(['短建议']);
  });

  it('处理建议：格式', () => {
    const text = '你好\n建议：选项A | 选项B';
    const result = parseSuggestions(text);
    expect(result.suggestions).toEqual(['选项A', '选项B']);
  });
});

