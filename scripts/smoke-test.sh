#!/usr/bin/env bash
set -euo pipefail

# 用法: bash scripts/smoke-test.sh [URL]
BASE_URL="${1:-https://cyber-guide-seven.vercel.app}"
PASS=0
FAIL=0

green() { echo -e "\033[32m[PASS] $1\033[0m"; PASS=$((PASS + 1)); }
red() { echo -e "\033[31m[FAIL] $1\033[0m"; FAIL=$((FAIL + 1)); }
yellow() { echo -e "\033[33m[RUN]  $1\033[0m"; }

extract_chat_payload() {
  printf "%s" "$1" | node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8").trim();
if (!input) process.exit(2);
let payload = null;
for (const raw of input.split(/\n+/)) {
  const line = raw.trim();
  if (!line) continue;
  try {
    const obj = JSON.parse(line);
    if (obj && obj.t === "meta") {
      payload = obj;
      continue;
    }
    if (obj && typeof obj.message === "string") {
      payload = obj;
    }
  } catch {}
}
if (!payload || typeof payload.message !== "string") process.exit(3);
const out = {
  message: payload.message,
  suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
  isCrisis: Boolean(payload.isCrisis),
};
process.stdout.write(JSON.stringify(out));
'
}

print_summary() {
  echo ""
  echo "================================"
  echo "Smoke 结果: $PASS 通过 | $FAIL 失败"
  echo "================================"
  echo ""
}

echo ""
echo "Cyber Guide Smoke Test"
echo "目标: $BASE_URL"
echo "================================"
echo ""

yellow "1) 页面可访问"
status_code="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL")"
if [ "$status_code" = "200" ]; then
  green "首页返回 200"
else
  red "首页状态码异常: $status_code"
fi

yellow "2) chat 接口可返回 message（兼容 NDJSON/JSON）"
chat_response_with_headers="$(curl -sS -i -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好，我是大二学计算机的"}],"mode":"chat"}' \
  --max-time 30)"
chat_headers="$(printf "%s\n" "$chat_response_with_headers" | awk 'BEGIN{h=1} h==1 {print} /^\r?$/ {h=0}')"
chat_body="$(printf "%s\n" "$chat_response_with_headers" | awk 'BEGIN{h=1} h==1 && /^\r?$/ {h=0; next} h==0 {print}')"

if printf "%s" "$chat_headers" | grep -Eqi "content-type:\s*(application/x-ndjson|application/json)"; then
  green "chat content-type 合法（ndjson/json）"
else
  red "chat content-type 非预期"
fi

if parsed_chat="$(extract_chat_payload "$chat_body" 2>/dev/null)"; then
  if printf "%s" "$parsed_chat" | grep -q '"message":"'; then
    green "chat 返回 message"
  else
    red "chat message 为空"
  fi
  if printf "%s" "$parsed_chat" | grep -q '"suggestions":\['; then
    green "chat 返回 suggestions 字段"
  else
    red "chat 缺少 suggestions 字段"
  fi
else
  red "chat 返回内容无法解析"
fi

yellow "3) 危机检测应触发"
crisis_raw="$(curl -sS -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"我不想活了"}],"mode":"chat"}' \
  --max-time 10)"
if crisis_parsed="$(extract_chat_payload "$crisis_raw" 2>/dev/null)"; then
  if printf "%s" "$crisis_parsed" | grep -q '"isCrisis":true'; then
    green "危机检测触发正常"
  else
    red "危机检测未触发"
  fi
else
  red "危机检测返回无法解析"
fi

yellow "4) 误触发过滤：'热死了' 不应触发危机"
safe_raw="$(curl -sS -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"今天热死了"}],"mode":"chat"}' \
  --max-time 20)"
if safe_parsed="$(extract_chat_payload "$safe_raw" 2>/dev/null)"; then
  if printf "%s" "$safe_parsed" | grep -q '"isCrisis":false'; then
    green "误触发过滤正常"
  else
    red "误触发过滤失败"
  fi
else
  red "误触发测试返回无法解析"
fi

yellow "5) profile 模式可返回 message"
profile_raw="$(curl -sS -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"我是大三计算机专业，最近在纠结考研还是就业"}],"mode":"profile"}' \
  --max-time 30)"
if extract_chat_payload "$profile_raw" >/dev/null 2>&1; then
  green "profile 模式正常"
else
  red "profile 模式异常"
fi

yellow "6) profile_other 模式可返回 message"
profile_other_raw="$(curl -sS -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"室友总是深夜打游戏影响我休息"}],"mode":"profile_other"}' \
  --max-time 30)"
if extract_chat_payload "$profile_other_raw" >/dev/null 2>&1; then
  green "profile_other 模式正常"
else
  red "profile_other 模式异常"
fi

yellow "7) generate_report 模式可返回 message"
report_raw="$(curl -sS -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"我大二，最近很焦虑，不知道该走什么方向"},{"role":"assistant","content":"嗯，我在。能说说你最近最卡的点吗？"},{"role":"user","content":"看别人都在实习，自己没项目经验很慌"}],"mode":"generate_report"}' \
  --max-time 40)"
if extract_chat_payload "$report_raw" >/dev/null 2>&1; then
  green "generate_report 模式正常"
else
  red "generate_report 模式异常"
fi

yellow "8) feedback 接口可写入"
feedback_resp="$(curl -sS -X POST "$BASE_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"测试消息"},{"role":"assistant","content":"测试回复"}],"rating":8,"feedback":"自动化测试","hadCrisis":false,"mode":"chat"}' \
  --max-time 15)"
if printf "%s" "$feedback_resp" | grep -q '"success":true'; then
  green "feedback 接口正常"
else
  red "feedback 接口异常"
fi

yellow "9) chat 参数校验：空 messages 应返回 400"
empty_status="$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[],"mode":"chat"}' \
  --max-time 10)"
if [ "$empty_status" = "400" ]; then
  green "空 messages 返回 400"
else
  red "空 messages 状态码异常: $empty_status"
fi

yellow "10) plan/fetch 接口可响应"
plan_status="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/api/plan/fetch?session_id=smoke-session" --max-time 10)"
if [ "$plan_status" = "200" ] || [ "$plan_status" = "404" ]; then
  green "plan/fetch 接口可响应（$plan_status）"
else
  red "plan/fetch 状态码异常: $plan_status"
fi

print_summary

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

