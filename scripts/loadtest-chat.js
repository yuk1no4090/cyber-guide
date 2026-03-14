import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const CHAT_PATH = __ENV.CHAT_PATH || '/api/chat';
const STREAM_PATH = __ENV.STREAM_PATH || '/api/chat/stream';
const AUTH_PATH = __ENV.AUTH_PATH || '/api/auth/anonymous';
const MODE = (__ENV.MODE || 'chat').toLowerCase(); // chat | stream
const IS_STREAM = MODE === 'stream';
const PROFILE = (__ENV.PROFILE || 'quick').toLowerCase(); // quick | standard | stress
const THINK_TIME = Number(__ENV.THINK_TIME || 0.2);
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || (IS_STREAM ? '45s' : '35s');

const authLatency = new Trend('auth_latency', true);
const chatLatency = new Trend('chat_latency', true);
const streamLatency = new Trend('stream_latency', true);
const authFail = new Counter('auth_fail_count');
const chatFail = new Counter('chat_fail_count');
const status2xxCount = new Counter('status_2xx_count');
const status429Count = new Counter('status_429_count');
const status5xxCount = new Counter('status_5xx_count');
const statusOtherCount = new Counter('status_other_count');
const networkErrorCount = new Counter('network_error_count');

const SCENARIOS = {
  quick: [
    { duration: '20s', target: 20 },
    { duration: '40s', target: 50 },
    { duration: '20s', target: 0 },
  ],
  standard: [
    { duration: '30s', target: 50 },
    { duration: '60s', target: 150 },
    { duration: '60s', target: 300 },
    { duration: '30s', target: 0 },
  ],
  stress: [
    { duration: '30s', target: 100 },
    { duration: '60s', target: 300 },
    { duration: '60s', target: 600 },
    { duration: '60s', target: 1000 },
    { duration: '30s', target: 0 },
  ],
};

const COMMON_THRESHOLDS = {
  auth_fail_count: ['count<50'],
  chat_fail_count: ['count<200'],
  http_req_failed: ['rate<0.10'],
  network_error_count: ['count<50'],
};

const CHAT_THRESHOLDS = {
  ...COMMON_THRESHOLDS,
  http_req_duration: ['p(95)<15000', 'p(99)<25000'],
  chat_latency: ['p(95)<15000'],
};

const STREAM_THRESHOLDS = {
  ...COMMON_THRESHOLDS,
  http_req_duration: ['p(95)<30000', 'p(99)<45000'],
  stream_latency: ['p(95)<30000'],
};

export const options = {
  scenarios: {
    chat_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: SCENARIOS[PROFILE] || SCENARIOS.quick,
      gracefulRampDown: '10s',
    },
  },
  thresholds: IS_STREAM ? STREAM_THRESHOLDS : CHAT_THRESHOLDS,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function randomSessionId(vu, iter) {
  return `k6-${PROFILE}-${MODE}-vu${vu}-it${iter}-${Date.now()}`;
}

function getToken(sessionId) {
  const payload = JSON.stringify({ session_id: sessionId });
  const res = http.post(`${BASE_URL}${AUTH_PATH}`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'auth' },
  });
  authLatency.add(res.timings.duration);

  const ok = check(res, {
    'auth status is 200': (r) => r.status === 200,
    'auth has token': (r) => {
      try {
        const data = r.json();
        return !!data?.token;
      } catch (_) {
        return false;
      }
    },
  });

  if (!ok) {
    authFail.add(1);
    return null;
  }
  return res.json('token');
}

function buildMessages() {
  return [
    {
      role: 'user',
      content: '我是某211计算机大三，GPA 3.6，有一段后端实习和一个科研项目，想在就业和读研之间做选择。',
    },
  ];
}

function runChat(token, sessionId) {
  const payload = JSON.stringify({
    messages: buildMessages(),
    mode: 'chat',
    session_id: sessionId,
  });
  const res = http.post(`${BASE_URL}${CHAT_PATH}`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { name: 'chat' },
    timeout: REQUEST_TIMEOUT,
  });
  chatLatency.add(res.timings.duration);
  recordResponseStatus(res);

  const ok = check(res, {
    'chat status 2xx': (r) => r.status >= 200 && r.status < 300,
    'chat has message': (r) => {
      try {
        const data = r.json();
        return typeof data?.message === 'string' && data.message.length > 0;
      } catch (_) {
        return false;
      }
    },
  });
  if (!ok) chatFail.add(1);
}

function runStream(token, sessionId) {
  const payload = JSON.stringify({
    messages: buildMessages(),
    mode: 'chat',
    session_id: sessionId,
  });
  const res = http.post(`${BASE_URL}${STREAM_PATH}`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { name: 'chat_stream' },
    timeout: REQUEST_TIMEOUT,
  });
  streamLatency.add(res.timings.duration);
  recordResponseStatus(res);

  const ok = check(res, {
    'stream status 2xx': (r) => r.status >= 200 && r.status < 300,
    'stream has ndjson meta line': (r) => typeof r.body === 'string' && r.body.includes('"t":"meta"'),
  });
  if (!ok) chatFail.add(1);
}

function recordResponseStatus(res) {
  if (res.error) {
    networkErrorCount.add(1);
  }
  if (res.status >= 200 && res.status < 300) {
    status2xxCount.add(1);
  } else if (res.status === 429) {
    status429Count.add(1);
  } else if (res.status >= 500) {
    status5xxCount.add(1);
  } else {
    statusOtherCount.add(1);
  }
}

export default function () {
  const sessionId = randomSessionId(__VU, __ITER);
  const token = getToken(sessionId);
  if (!token) return;

  if (MODE === 'stream') {
    runStream(token, sessionId);
  } else {
    runChat(token, sessionId);
  }
  sleep(THINK_TIME);
}
