# Cyber Guide 服务器部署指南

## 📋 前置要求

### 服务器配置
- **操作系统**：Ubuntu 22.04 LTS / CentOS 8+ / Debian 11+
- **CPU**：2 核心以上
- **内存**：4GB 以上（推荐 8GB）
- **硬盘**：20GB 以上
- **网络**：公网 IP + 域名（可选）

### 需要安装的软件
- Docker 24.0+
- Docker Compose 2.20+
- Git

---

## 🚀 快速部署（推荐）

### 1. 连接服务器

```bash
ssh root@your-server-ip
```

### 2. 安装 Docker 和 Docker Compose

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 启动 Docker
systemctl start docker
systemctl enable docker

# 验证安装
docker --version
docker compose version
```

### 3. 克隆项目

```bash
cd /opt
git clone https://github.com/yuk1no4090/cyber-guide.git
cd cyber-guide
```

### 4. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
vim .env
```

**必须修改的配置**：

```bash
# AI API（必填）
# 变量名沿用 OpenAI 兼容接口风格；默认 endpoint / model 已指向智谱兼容服务
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OPENAI_MODEL=glm-4-flash

# 数据库密码（必改）
POSTGRES_PASSWORD=your-strong-password-here

# JWT 密钥（必改，至少 32 位）
JWT_SECRET=your-random-secret-at-least-32-chars-long

# 前端 API 地址（改成你的域名或 IP）
NEXT_PUBLIC_API_BASE_URL=http://your-domain.com:8080
# 或者用 IP：http://123.45.67.89:8080

# GitHub OAuth（可选）
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URI=http://your-domain.com:8080/api/auth/github/callback
GITHUB_FRONTEND_CALLBACK=http://your-domain.com:3000
```

### 5. 启动服务

```bash
# 构建并启动所有服务
docker compose up -d --build

# 查看日志
docker compose logs -f

# 查看服务状态
docker compose ps
```

### 6. 验证部署

```bash
# 检查后端健康状态
curl http://localhost:8080/actuator/health

# 检查前端
curl http://localhost:3000

# 检查数据库
docker exec -it cyber-guide-postgres-1 psql -U cyber_guide -d cyber_guide -c "SELECT 1;"

# 检查 Redis
docker exec -it cyber-guide-redis-1 redis-cli ping
```

---

## 🌐 配置域名和 HTTPS（推荐）

### 方案 1：使用 Nginx + Let's Encrypt

#### 1. 安装 Nginx 和 Certbot

```bash
apt update
apt install -y nginx certbot python3-certbot-nginx
```

#### 2. 配置 Nginx

创建配置文件：

```bash
vim /etc/nginx/sites-available/cyber-guide
```

粘贴以下内容：

```nginx
# 前端
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 后端 API
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE 支持（聊天流式响应）
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

#### 3. 启用配置

```bash
ln -s /etc/nginx/sites-available/cyber-guide /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

#### 4. 申请 SSL 证书

```bash
certbot --nginx -d your-domain.com -d api.your-domain.com
```

#### 5. 更新环境变量

```bash
vim /opt/cyber-guide/.env
```

修改：

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
GITHUB_REDIRECT_URI=https://api.your-domain.com/api/auth/github/callback
GITHUB_FRONTEND_CALLBACK=https://your-domain.com
```

重启服务：

```bash
cd /opt/cyber-guide
docker compose down
docker compose up -d --build
```

---

## 🔧 常用运维命令

### 查看日志

```bash
# 查看所有服务日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
docker compose logs -f redis
docker compose logs -f crawler

# 查看最近 100 行日志
docker compose logs --tail=100 backend
```

### 重启服务

```bash
# 重启所有服务
docker compose restart

# 重启特定服务
docker compose restart backend
docker compose restart frontend
```

### 更新代码

```bash
cd /opt/cyber-guide
git pull
docker compose down
docker compose up -d --build
```

### 备份数据库

```bash
# 备份
docker exec cyber-guide-postgres-1 pg_dump -U cyber_guide cyber_guide > backup_$(date +%Y%m%d_%H%M%S).sql

# 恢复
docker exec -i cyber-guide-postgres-1 psql -U cyber_guide cyber_guide < backup_20260427_120000.sql
```

### 清理 Docker 资源

```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的容器
docker container prune

# 清理未使用的卷
docker volume prune
```

---

## 📊 监控和性能优化

### 1. 查看资源占用

```bash
# 查看容器资源占用
docker stats

# 查看磁盘占用
df -h
du -sh /var/lib/docker
```

### 2. 配置防火墙

```bash
# 开放端口（如果使用 Nginx 反向代理，只需开放 80 和 443）
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw enable

# 如果直接暴露服务端口
ufw allow 3000/tcp
ufw allow 8080/tcp
```

### 3. 设置自动重启

Docker Compose 配置中已经设置了 `restart: unless-stopped`，服务会在崩溃或服务器重启后自动启动。

---

## 🐛 常见问题

### 1. 前端无法连接后端

**问题**：前端显示网络错误

**解决**：
```bash
# 检查 NEXT_PUBLIC_API_BASE_URL 是否正确
cat /opt/cyber-guide/.env | grep NEXT_PUBLIC_API_BASE_URL

# 确保后端服务正常运行
curl http://localhost:8080/actuator/health

# 重新构建前端
docker compose up -d --build frontend
```

### 2. 数据库连接失败

**问题**：后端日志显示数据库连接错误

**解决**：
```bash
# 检查数据库是否运行
docker compose ps postgres

# 检查数据库健康状态
docker exec cyber-guide-postgres-1 pg_isready -U cyber_guide

# 重启数据库
docker compose restart postgres
```

### 3. 内存不足

**问题**：服务频繁崩溃

**解决**：
```bash
# 限制 Redis 内存（已在 docker-compose.yml 中配置为 128MB）
# 如果内存仍然不足，可以禁用爬虫
vim /opt/cyber-guide/.env
# 设置 CRAWLER_ENABLED=false

docker compose up -d
```

### 4. SSL 证书过期

**问题**：HTTPS 证书过期

**解决**：
```bash
# Certbot 会自动续期，检查自动续期任务
systemctl status certbot.timer

# 手动续期
certbot renew

# 重启 Nginx
systemctl reload nginx
```

---

## 🔐 安全建议

1. **修改默认密码**：确保修改了 `.env` 中的所有密码
2. **使用 HTTPS**：生产环境必须使用 HTTPS
3. **限制端口访问**：只开放必要的端口（80, 443, 22）
4. **定期备份**：设置定时任务备份数据库
5. **更新系统**：定期更新服务器和 Docker 镜像
6. **监控日志**：定期检查日志，发现异常及时处理

---

## 📦 生产环境优化

### 1. 使用外部数据库（可选）

如果你有独立的数据库服务器，可以修改 `.env`：

```bash
POSTGRES_HOST=your-db-server.com
POSTGRES_PORT=5432
```

然后在 `docker-compose.yml` 中注释掉 postgres 服务。

### 2. 使用 CDN（可选）

将前端静态资源部署到 CDN，提升访问速度。

### 3. 配置日志轮转

```bash
# 创建 Docker 日志配置
vim /etc/docker/daemon.json
```

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

```bash
systemctl restart docker
```

---

## 📞 获取帮助

- **GitHub Issues**：https://github.com/yuk1no4090/cyber-guide/issues
- **查看日志**：`docker compose logs -f`
- **健康检查**：`curl http://localhost:8080/actuator/health`

---

## 🎉 部署完成！

访问你的网站：
- **前端**：http://your-domain.com 或 http://your-ip:3000
- **后端 API**：http://api.your-domain.com 或 http://your-ip:8080
- **健康检查**：http://your-ip:8080/actuator/health

祝你部署顺利！🚀
