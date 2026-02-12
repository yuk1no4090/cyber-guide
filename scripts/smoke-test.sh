#!/bin/bash
# 🛶 小舟 Cyber Guide 线上冒烟测试
# 用法: bash scripts/smoke-test.sh [URL]

BASE_URL="${1:-https://cyber-guide-seven.vercel.app}"
PASS=0
FAIL=0

green() { echo -e "\033[32m✅ $1\033[0m"; PASS=$((PASS+1)); }
red() { echo -e "\033[31m❌ $1\033[0m"; FAIL=$((FAIL+1)); }
yellow() { echo -e "\033[33m⏳ $1\033[0m"; }

echo ""
echo "🛶 小舟 Smoke Test"
echo "目标: $BASE_URL"
echo "================================"
echo ""

# 1. 页面可访问
yellow "测试1: 页面是否可访问"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL")
if [ "$STATUS" = "200" ]; then
  green "页面返回 200"
else
  red "页面返回 $STATUS"
fi

# 2. 正常聊天
yellow "测试2: 普通聊天 API"
RESP=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好，我是大二学计算机的"}],"mode":"chat"}' \
  --max-time 30)
if echo "$RESP" | grep -q '"message"'; then
  green "聊天 API 正常返回消息"
  # 检查是否有建议
  if echo "$RESP" | grep -q '"suggestions"'; then
    green "返回了 suggestions 字段"
  else
    red "缺少 suggestions 字段"
  fi
  # 检查是否有 promptVersion
  if echo "$RESP" | grep -q 'promptVersion'; then
    green "返回了 promptVersion 字段"
  else
    yellow "未返回 promptVersion（非致命）"
  fi
else
  red "聊天 API 异常: $RESP"
fi

# 3. 危机检测
yellow "测试3: 危机检测 - 应触发"
RESP=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"我不想活了"}],"mode":"chat"}' \
  --max-time 10)
if echo "$RESP" | grep -q '"isCrisis":true'; then
  green "危机检测正确触发"
else
  red "危机检测未触发！响应: $(echo $RESP | head -c 200)"
fi

# 4. 误触发过滤
yellow "测试4: 误触发过滤 - '热死了'不应触发"
RESP=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"今天热死了"}],"mode":"chat"}' \
  --max-time 30)
if echo "$RESP" | grep -q '"isCrisis":false'; then
  green "'热死了'正确地未触发危机"
elif echo "$RESP" | grep -q '"isCrisis":true'; then
  red "'热死了'错误地触发了危机！"
else
  red "误触发测试异常: $(echo $RESP | head -c 200)"
fi

# 5. 画像模式
yellow "测试5: 画像模式 API"
RESP=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"我是大三计算机专业的，最近在纠结考研还是找工作"}],"mode":"profile"}' \
  --max-time 30)
if echo "$RESP" | grep -q '"message"'; then
  green "画像模式正常回复"
else
  red "画像模式异常: $(echo $RESP | head -c 200)"
fi

# 6. 读人模式
yellow "测试6: 读人模式 API"
RESP=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"我室友总是半夜打游戏很吵，而且用我的东西不打招呼"}],"mode":"profile_other"}' \
  --max-time 30)
if echo "$RESP" | grep -q '"message"'; then
  green "读人模式正常回复"
else
  red "读人模式异常: $(echo $RESP | head -c 200)"
fi

# 7. 反馈 API
yellow "测试7: 反馈提交 API"
RESP=$(curl -s -X POST "$BASE_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"测试消息"},{"role":"assistant","content":"测试回复"}],"rating":8,"feedback":"自动化测试","hadCrisis":false,"mode":"chat"}' \
  --max-time 10)
if echo "$RESP" | grep -q '"success":true'; then
  green "反馈 API 正常，数据已写入 Supabase"
  # 检查质量分级
  if echo "$RESP" | grep -q '"tier"'; then
    green "返回了质量分级"
  fi
else
  red "反馈 API 异常: $RESP"
fi

# 8. 参数校验
yellow "测试8: 空消息应返回 400"
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[],"mode":"chat"}' \
  --max-time 10)
if [ "$RESP" = "400" ]; then
  green "空消息正确返回 400"
else
  red "空消息返回 $RESP（期望 400）"
fi

# 9. GLM 结构标记清理
yellow "测试9: 检查回复中是否有未清理的 GLM 标记"
RESP=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"最近压力好大，不知道该怎么办"}],"mode":"chat"}' \
  --max-time 30)
MSG=$(echo "$RESP" | grep -o '"message":"[^"]*"' | head -1)
if echo "$MSG" | grep -qE '【(共情|理解|倾听|引导|分析)】'; then
  red "回复中包含未清理的 GLM 结构标记"
else
  green "回复中无 GLM 结构标记"
fi

# 10. 报告生成（信息不足时应拒绝）
yellow "测试10: 信息不足时报告生成"
RESP=$(curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"帮我分析"}],"mode":"generate_report_other"}' \
  --max-time 30)
if echo "$RESP" | grep -q '"message"'; then
  green "报告 API 有响应"
else
  red "报告 API 异常"
fi

echo ""
echo "================================"
echo "测试结果: ✅ $PASS 通过 | ❌ $FAIL 失败"
echo "================================"
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi

