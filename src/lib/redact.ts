/**
 * 数据脱敏模块
 * 替换敏感信息如手机号、邮箱、姓名等
 */

// 脱敏规则
const REDACTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // 顺序很重要：长数字模式必须在短模式之前，否则会被截断匹配
  
  // 身份证号（18位）— 必须在手机号之前
  { pattern: /\d{17}[\dXx]/g, replacement: '[ID_CARD]' },
  
  // 银行卡号（16-19位数字）— 必须在手机号之前
  { pattern: /\d{16,19}/g, replacement: '[BANK_CARD]' },
  
  // 身份证号（15位老版）
  { pattern: /(?<!\d)\d{15}(?!\d)/g, replacement: '[ID_CARD]' },
  
  // 中国大陆手机号
  { pattern: /1[3-9]\d{9}/g, replacement: '[PHONE]' },
  
  // 电子邮箱
  { pattern: /[\w.-]+@[\w.-]+\.\w+/gi, replacement: '[EMAIL]' },
  
  // IP 地址
  { pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, replacement: '[IP]' },
  
  // 中文姓名（启发式：常见姓氏 + 1-2个汉字）
  { 
    pattern: /(?<![一-龥])([张王李赵刘陈杨黄周吴徐孙马朱胡郭何林高罗郑梁谢宋唐许邓冯韩曹曾彭萧蔡潘田董袁于余叶杜苏魏程吕丁沈任姚卢傅钟姜崔谭廖范汪陆金石戴贾韦夏邱方侯邹熊孟秦白江阎薛尹段雷黎史龙陶贺顾毛郝龚邵万钱严赖覃洪武莫孔])([一-龥]{1,2})(?![一-龥])/g,
    replacement: '[NAME]' 
  },
  
  // QQ号（仅在存在明确上下文时脱敏，避免误伤学号/分数等数字）
  { pattern: /(?:qq|q号|扣扣)(?:号)?[：:\s]*[1-9]\d{4,10}/gi, replacement: '[QQ]' },
  
  // 微信号（字母开头，6-20个字符）
  { pattern: /(?<=微信[号：:]\s*)[a-zA-Z][\w-]{5,19}/gi, replacement: '[WECHAT]' },
];

/**
 * 对文本进行脱敏处理
 */
export function redact(text: string): string {
  let redactedText = text;
  
  for (const rule of REDACTION_RULES) {
    redactedText = redactedText.replace(rule.pattern, rule.replacement);
  }
  
  return redactedText;
}

/**
 * 检查文本是否包含敏感信息
 */
export function containsSensitiveInfo(text: string): boolean {
  return REDACTION_RULES.some(rule => {
    // 避免 /g 正则的 lastIndex 状态导致结果抖动
    const stablePattern = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', ''));
    return stablePattern.test(text);
  });
}

